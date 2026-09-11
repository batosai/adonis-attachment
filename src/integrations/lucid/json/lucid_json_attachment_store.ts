/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { isDeepStrictEqual } from 'node:util'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { LucidRow } from '@adonisjs/lucid/types/model'
import type { Attachment } from '../../../core/attachment.js'
import type { AttachmentOwner, AttachmentPersistence, AttachmentTransaction } from '../../../core/attachment_persistence.js'
import type { AttachmentRepository } from '../../../core/attachment_repository.js'
import type { AttachmentMetadataPersister } from '../../../core/attachment_metadata_persister.js'
import type { AttachmentMetadata } from '../../../media/media_metadata.js'
import { JsonMetadataMutation } from './json_metadata_mutation.js'
import { parseAttachmentReference, type AttachmentReference } from '../../../core/attachment_reference.js'
import { markAttachmentPersisted } from '../../../core/attachment_state.js'
import { AttachmentConfigurationError, AttachmentConflictError, AttachmentNotFoundError, AttachmentValidationError } from '../../../errors.js'
import { attachmentTransaction, afterAttachmentCommit, afterAttachmentRollback } from '../persistence/attachment_transaction.js'
import {
  JsonAttachmentEntry, JsonAttachmentRecord, attachmentFromDocument, documentFromAttachment,
  decodeJsonAttachments, validateJsonAttachments, type JsonAttachmentDocument, type JsonAttachmentOwner,
} from './json_attachment_document.js'

export type LucidJsonAttachmentStoreOptions = {
  client: QueryClientContract
  /** Trusted application mapping, never read from a job or HTTP payload. */
  table: string
  primaryKey?: string
  column: string
  owner: JsonAttachmentOwner
  kind: 'one' | 'many'
  defaultDisk: string
  /** Bound by the relation integration; the managed column must not be an ordinary @column. */
  model?: LucidRow
}

/** Field-bound JSON persistence. All writers must use this locking protocol. */
export class LucidJsonAttachmentStore implements
  AttachmentPersistence<JsonAttachmentEntry, JsonAttachmentRecord>,
  AttachmentTransaction<LucidJsonAttachmentStore>, AttachmentRepository, AttachmentMetadataPersister {
  readonly #options: LucidJsonAttachmentStoreOptions
  #scoped = false
  readonly #released = new Map<string, JsonAttachmentDocument>()

  constructor(options: LucidJsonAttachmentStoreOptions) {
    for (const value of [options.table, options.column, options.primaryKey ?? 'id', options.defaultDisk]) {
      if (!value) throw new AttachmentConfigurationError('JSON persistence requires an explicit table, column, primary key and default disk')
    }
    if (!['one', 'many'].includes(options.kind)) throw new AttachmentConfigurationError('Invalid JSON attachment cardinality')
    this.#options = { ...options, owner: Object.freeze({ ...options.owner }) }
    parseAttachmentReference({ version: 1, adapter: 'json', id: 'configuration', owner: options.owner })
  }

  get isScoped(): boolean { return this.#scoped }
  get #client(): QueryClientContract { return this.#options.client }
  get #primaryKey(): string { return this.#options.primaryKey ?? 'id' }
  get #owner(): JsonAttachmentOwner { return this.#options.owner }

  async transaction<T>(owner: AttachmentOwner, callback: (store: LucidJsonAttachmentStore, owner: AttachmentOwner) => Promise<T>): Promise<T> {
    this.#assertOwner(owner)
    return attachmentTransaction(this.#client, async (client) => {
      const scoped = new LucidJsonAttachmentStore({ ...this.#options, client })
      scoped.#scoped = true
      if (['sqlite3', 'better-sqlite3', 'libsql'].includes(client.dialect.name)) {
        // Reserve SQLite's writer before reading even an empty JSON collection.
        await scoped.#query().update({ [this.#primaryKey]: this.#owner.id })
      }
      await scoped.#read() // Row lock and shape validation precede any file creation.
      return callback(scoped, owner)
    })
  }

  afterCommit(callback: () => void | Promise<void>): void {
    this.#requireScope()
    afterAttachmentCommit(this.#client as TransactionClientContract, callback)
  }
  afterRollback(callback: () => void | Promise<void>): void {
    this.#requireScope()
    afterAttachmentRollback(this.#client as TransactionClientContract, callback)
  }

  async createOriginal(owner: AttachmentOwner, attachment: Attachment): Promise<JsonAttachmentEntry> {
    this.#assertOwner(owner); this.#requireKind('one')
    if (!this.#scoped) return this.transaction(owner, (store) => store.createOriginal(owner, attachment))
    if ((await this.#read()).length) throw new AttachmentConflictError('This JSON owner field already has an attachment')
    const document = this.#newDocument(attachment)
    await this.#write([document])
    markAttachmentPersisted(attachment)
    return this.#entry(document, null)
  }

  async findOriginal(owner: AttachmentOwner): Promise<JsonAttachmentEntry | null> {
    this.#assertOwner(owner); this.#requireKind('one')
    const document = (await this.#read())[0]
    return document ? this.#entry(document, null) : null
  }

  async createCollectionItem(owner: AttachmentOwner, attachment: Attachment, position?: number): Promise<JsonAttachmentEntry> {
    this.#assertOwner(owner); this.#requireKind('many')
    if (!this.#scoped) return this.transaction(owner, (store) => store.createCollectionItem(owner, attachment, position))
    const documents = await this.#read()
    const target = normalizePosition(position, documents.length)
    const document = this.#newDocument(attachment)
    documents.splice(target, 0, document)
    await this.#write(documents)
    markAttachmentPersisted(attachment)
    return this.#entry(document, target)
  }

  async listCollection(owner: AttachmentOwner): Promise<JsonAttachmentEntry[]> {
    this.#assertOwner(owner); this.#requireKind('many')
    return (await this.#read()).map((document, index) => this.#entry(document, index))
  }
  async findCollectionItem(owner: AttachmentOwner, id: string): Promise<JsonAttachmentEntry | null> {
    return (await this.listCollection(owner)).find((entry) => entry.id === id) ?? null
  }
  async moveCollectionItem(owner: AttachmentOwner, id: string, position: number): Promise<JsonAttachmentEntry[]> {
    this.#assertOwner(owner); this.#requireKind('many')
    if (!this.#scoped) return this.transaction(owner, (store) => store.moveCollectionItem(owner, id, position))
    const documents = await this.#read()
    const source = documents.findIndex((document) => document.id === id)
    if (source < 0) throw new AttachmentNotFoundError(id)
    const target = normalizePosition(position, documents.length - 1)
    const [document] = documents.splice(source, 1)
    documents.splice(target, 0, document!)
    await this.#write(documents)
    return documents.map((item, index) => this.#entry(item, index))
  }
  removeCollectionItem(owner: AttachmentOwner, entry: JsonAttachmentEntry): Promise<JsonAttachmentRecord[]> {
    this.#assertOwner(owner); this.#requireKind('many')
    return this.remove(entry, owner)
  }

  async releaseOwner(entry: JsonAttachmentEntry): Promise<void> {
    this.#requireScope(); this.#assertOwner(entry.owner); this.#requireKind('one')
    const [document] = await this.#read()
    if (!document || document.id !== entry.id) throw new AttachmentConflictError('JSON attachment was replaced before ownership could be released')
    this.#released.set(document.id, document)
    await this.#write([])
  }
  async restoreOwner(entry: JsonAttachmentEntry): Promise<void> {
    this.#requireScope(); this.#assertOwner(entry.owner); this.#requireKind('one')
    const document = this.#released.get(entry.id)
    if (!document || (await this.#read()).length) throw new AttachmentConflictError('Cannot restore JSON attachment ownership')
    await this.#write([document])
    this.#released.delete(entry.id)
  }

  async remove(entry: JsonAttachmentEntry, owner: AttachmentOwner = this.#owner): Promise<JsonAttachmentRecord[]> {
    this.#assertOwner(owner); this.#assertOwner(entry.owner)
    if (!this.#scoped) return this.transaction(owner, (store) => store.remove(entry, owner))
    const documents = await this.#read()
    const index = documents.findIndex((document) => document.id === entry.id)
    const document = index < 0 ? this.#released.get(entry.id) : documents.splice(index, 1)[0]
    if (!document) return []
    if (index >= 0) await this.#write(documents)
    this.#released.delete(entry.id)
    const remaining = new Set(documents.flatMap((item) => this.#records(item)).map((item) => {
      const file = item.toAttachment(); return JSON.stringify([file.disk, file.path])
    }))
    return this.#records(document).filter((item) => {
      const file = item.toAttachment(); return !remaining.has(JSON.stringify([file.disk, file.path]))
    })
  }

  /** Only this configured field is managed by a field-bound JSON store. */
  async listOwnerLinks(owner: AttachmentOwner): Promise<JsonAttachmentEntry[]> {
    this.#assertOwner(owner)
    return (await this.#read()).map((document, index) => this.#entry(document, this.#options.kind === 'one' ? null : index))
  }
  async listVariants(originalId: string): Promise<JsonAttachmentRecord[]> {
    const original = (await this.#read()).find((document) => document.id === originalId)
    return original ? this.#records(original).slice(1) : []
  }
  async findById(id: string): Promise<Attachment | null> {
    let documents: JsonAttachmentDocument[]
    try { documents = await this.#read() } catch (error) {
      if (error instanceof AttachmentNotFoundError) return null
      throw error
    }
    for (const document of documents) {
      const record = this.#records(document).find((item) => item.id === id)
      if (record) return record.toAttachment()
    }
    return null
  }
  findByReference(value: AttachmentReference): Promise<Attachment | null> {
    const reference = parseAttachmentReference(value)
    if (reference.adapter !== 'json' || !reference.owner) throw new AttachmentValidationError('JSON references require an explicit owner')
    this.#assertOwner(reference.owner)
    return this.findById(reference.id)
  }

  async createVariant(original: JsonAttachmentRecord, key: string, attachment: Attachment): Promise<JsonAttachmentRecord> {
    this.#assertOwner(original.owner)
    if (!this.#scoped) return this.transaction(this.#owner, (store) => store.createVariant(original, key, attachment))
    const documents = await this.#read()
    const parent = this.#findOriginal(documents, original.id)
    if (parent.variants?.some((variant) => variant.key === key)) throw new AttachmentConflictError('JSON variant already exists')
    const variant = this.#newVariant(attachment, key)
    parent.variants = [...(parent.variants ?? []), variant]
    await this.#write(documents)
    markAttachmentPersisted(attachment)
    return this.#variant(variant, parent)
  }

  async replaceVariant(original: JsonAttachmentRecord, key: string, attachment: Attachment): Promise<{ variant: JsonAttachmentRecord; replaced: Attachment | undefined }> {
    this.#assertOwner(original.owner)
    if (!this.#scoped) return this.transaction(this.#owner, (store) => store.replaceVariant(original, key, attachment))
    const documents = await this.#read()
    const parent = this.#findOriginal(documents, original.id)
    const index = (parent.variants ?? []).findIndex((variant) => variant.key === key)
    const previous = index < 0 ? undefined : parent.variants![index]!
    if (previous?.id === attachment.id) throw new AttachmentConflictError('Variant replacements require a new file identity')
    const variant = this.#newVariant(attachment, key)
    parent.variants ??= []
    if (index < 0) parent.variants.push(variant)
    else parent.variants[index] = variant
    await this.#write(documents)
    markAttachmentPersisted(attachment)
    return { variant: this.#variant(variant, parent), replaced: previous ? this.#variant(previous, parent).toAttachment() : undefined }
  }

  async persistMetadata(attachment: Attachment, metadata: NonNullable<Attachment['metadata']>): Promise<void> {
    await this.patchMetadata(attachment, attachment.metadata, metadata)
  }

  /** Apply local metadata edits against their original snapshot, preserving concurrent unrelated edits. */
  async patchMetadata(attachment: Attachment, before: AttachmentMetadata | undefined, after: AttachmentMetadata | undefined): Promise<Attachment> {
    if (!attachment.reference) throw new AttachmentValidationError('JSON metadata persistence requires an attachment reference')
    const reference = parseAttachmentReference(attachment.reference)
    if (reference.adapter !== 'json' || reference.id !== attachment.id || !reference.owner) throw new AttachmentValidationError('Invalid JSON metadata reference')
    this.#assertOwner(reference.owner)
    // Capture the caller's intent before waiting for a transaction/lock. In-place
    // changes to their objects while this call is pending must not alter the write.
    const mutation = new JsonMetadataMutation(before, after)
    const target = { id: attachment.id, disk: attachment.disk, path: attachment.path }
    if (!this.#scoped) return this.transaction(this.#owner, (store) => store.#patchMetadata(target, mutation))
    return this.#patchMetadata(target, mutation)
  }

  async #patchMetadata(target: Pick<Attachment, 'id' | 'disk' | 'path'>, mutation: JsonMetadataMutation): Promise<Attachment> {
    this.#requireScope()
    const documents = await this.#read()
    const original = documents.find((item) => item.id === target.id || item.variants?.some((variant) => variant.id === target.id))
    if (!original) throw new AttachmentNotFoundError(target.id)
    const document = original.id === target.id ? original : original.variants!.find((variant) => variant.id === target.id)!
    const record = () => document === original ? this.#entry(document, null) : this.#variant(document, original)
    const current = record().toAttachment()
    if (current.disk !== target.disk || current.path !== target.path) throw new AttachmentConflictError('Attachment file changed before metadata persistence')
    const metadata = mutation.apply(current.metadata)
    if (isDeepStrictEqual(metadata, current.metadata)) return current
    if (metadata === undefined) delete document.meta
    else document.meta = metadata
    await this.#write(documents)
    return record().toAttachment()
  }

  #query() { return this.#client.from(this.#options.table).where(this.#primaryKey, this.#owner.id) }
  async #read(): Promise<JsonAttachmentDocument[]> {
    const query = this.#query().select(this.#options.column)
    if (this.#scoped && !['sqlite3', 'better-sqlite3', 'libsql'].includes(this.#client.dialect.name)) query.forUpdate()
    // Oracle cannot lock Knex's LIMIT wrapper subquery.
    const row = this.#client.dialect.name === 'oracledb'
      ? (await query.whereRaw('rownum <= 1'))[0]
      : await query.first()
    if (!row) throw new AttachmentNotFoundError(`owner:${this.#owner.type}:${this.#owner.id}`)
    const documents = decodeJsonAttachments(row[this.#options.column], this.#options.kind, this.#owner, this.#options.defaultDisk)
    this.#syncModel(row[this.#options.column])
    return documents
  }
  async #write(documents: JsonAttachmentDocument[]): Promise<void> {
    this.#requireScope()
    validateJsonAttachments(documents, this.#options.defaultDisk)
    const value = this.#options.kind === 'one' ? documents[0] ?? null : documents
    await this.#query().update({ [this.#options.column]: value === null ? null : JSON.stringify(value) })
    this.#syncModel(value === null ? null : JSON.stringify(value))
  }
  #syncModel(value: unknown): void {
    const model = this.#options.model
    if (!model) return
    const column = this.#options.column
    const present = Object.hasOwn(model.$extras, column)
    const previous = model.$extras[column]
    if (this.#scoped) this.afterRollback(() => {
      if (present) model.$extras[column] = previous
      else delete model.$extras[column]
    })
    model.$extras[column] = structuredClone(value)
  }
  #entry(document: JsonAttachmentDocument, position: number | null): JsonAttachmentEntry {
    return new JsonAttachmentEntry(document.id, this.#owner, attachmentFromDocument(document, this.#options.defaultDisk), position)
  }
  #variant(document: JsonAttachmentDocument, parent: JsonAttachmentDocument): JsonAttachmentRecord {
    return new JsonAttachmentRecord(document.id, this.#owner, attachmentFromDocument(document, this.#options.defaultDisk, String(parent.originalName ?? parent.name)), parent.id, String(document.key))
  }
  #records(document: JsonAttachmentDocument): JsonAttachmentRecord[] {
    return [this.#entry(document, null), ...(document.variants ?? []).map((variant) => this.#variant(variant, document))]
  }
  #newDocument(attachment: Attachment): JsonAttachmentDocument {
    if ([...this.#released.values()].some((document) => [document, ...(document.variants ?? [])].some((item) => item.id === attachment.id))) {
      throw new AttachmentConflictError('Replacements require a new file identity')
    }
    return documentFromAttachment(attachment)
  }
  #newVariant(attachment: Attachment, key: string): JsonAttachmentDocument {
    if (!key) throw new AttachmentValidationError('Variant key must not be empty')
    return { ...this.#newDocument(attachment), key }
  }
  #findOriginal(documents: JsonAttachmentDocument[], id: string): JsonAttachmentDocument {
    const document = documents.find((item) => item.id === id)
    if (!document) throw new AttachmentNotFoundError(id)
    return document
  }
  #assertOwner(owner: AttachmentOwner): void {
    if (owner.type !== this.#owner.type || owner.id !== this.#owner.id || owner.field !== this.#owner.field) throw new AttachmentValidationError('Owner does not match the configured JSON field')
    if (owner.model !== undefined && owner.model !== this.#options.model) throw new AttachmentConfigurationError('JSON model owners require a store bound to that same model; use the attachment decorator or a plain owner')
  }
  #requireScope(): void {
    if (!this.#scoped) throw new AttachmentConfigurationError('This JSON operation requires a transaction-scoped store')
  }
  #requireKind(kind: 'one' | 'many'): void {
    if (this.#options.kind !== kind) throw new AttachmentConfigurationError(`JSON field requires ${this.#options.kind} attachment operations`)
  }
}

function normalizePosition(position: number | undefined, maximum: number): number {
  if (position === undefined) return maximum
  if (!Number.isSafeInteger(position) || position < 0) throw new AttachmentValidationError('Attachment positions must be non-negative integers')
  return Math.min(position, maximum)
}
