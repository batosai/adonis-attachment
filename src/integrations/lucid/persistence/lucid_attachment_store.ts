/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { randomUUID } from 'node:crypto'

import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { LucidRow, LucidModel } from '@adonisjs/lucid/types/model'

import { toPersistedAttachment, type Attachment } from '../../../core/attachment.js'
import { assertTableAttachmentReference } from './assert_table_attachment_reference.js'
import type { AttachmentPersistence, AttachmentTransaction } from '../../../core/attachment_persistence.js'
import { markAttachmentPersisted } from '../../../core/attachment_state.js'
import { createAttachmentOwnerKey, type AttachmentOwner } from '../relations/attachment_owner.js'
import { AttachmentLinkModel } from '../models/attachment_link_model.js'
import { AttachmentModel } from '../models/attachment_model.js'
import { AttachmentConfigurationError, AttachmentNotFoundError, AttachmentValidationError } from '../../../errors.js'
import { attachmentTransaction, afterAttachmentCommit, afterAttachmentRollback } from './attachment_transaction.js'

export type LucidAttachmentWithVariants = {
  original: AttachmentLinkModel
  variants: AttachmentModel[]
}

export type ReplacedLucidVariant = {
  variant: AttachmentModel
  replaced: Attachment | undefined
}

export type LucidAttachmentStoreOptions = {
  client?: TransactionClientContract
  linkModel?: typeof AttachmentLinkModel
  createLinkId?: () => string
}

/**
 * Persists immutable file blobs separately from their polymorphic owner links.
 */
export class LucidAttachmentStore implements
  AttachmentPersistence<AttachmentLinkModel, AttachmentModel>,
  AttachmentTransaction<LucidAttachmentStore> {
  readonly #blobModel: typeof AttachmentModel
  readonly #linkModel: typeof AttachmentLinkModel
  readonly #client: TransactionClientContract | undefined
  readonly #createLinkId: () => string
  #scoped = false

  get isScoped(): boolean {
    return this.#scoped
  }

  get #isSqlite(): boolean {
    return ['sqlite3', 'better-sqlite3', 'libsql'].includes(this.#client?.dialect.name ?? '')
  }

  /** Serialize an owner's mutations, including when its collection is empty. */
  async transaction<T>(
    owner: AttachmentOwner,
    callback: (store: LucidAttachmentStore, owner: AttachmentOwner) => Promise<T>
  ): Promise<T> {
    const run = async (client: TransactionClientContract) => {
      const store = new LucidAttachmentStore(this.#blobModel, {
        client, linkModel: this.#linkModel, createLinkId: this.#createLinkId,
      })
      store.#scoped = true
      await store.#lockOwner(owner)
      return callback(store, owner)
    }
    return attachmentTransaction(this.#client ?? this.#blobModel.$adapter.modelConstructorClient(this.#blobModel), run)
  }

  afterCommit(callback: () => void | Promise<void>): void {
    afterAttachmentCommit(this.#client!, callback)
  }

  afterRollback(callback: () => void | Promise<void>): void {
    afterAttachmentRollback(this.#client!, callback)
  }

  get client(): TransactionClientContract | undefined {
    return this.#client
  }

  constructor(
    blobModel: typeof AttachmentModel = AttachmentModel,
    options: LucidAttachmentStoreOptions = {}
  ) {
    this.#blobModel = blobModel
    this.#linkModel = options.linkModel ?? AttachmentLinkModel
    this.#client = options.client
    this.#createLinkId = options.createLinkId ?? randomUUID
  }

  async createOriginal(owner: AttachmentOwner, attachment: Attachment): Promise<AttachmentLinkModel> {
    if (!this.#scoped) return this.transaction(owner, (store) => store.createOriginal(owner, attachment))
    const blob = await this.#createBlob(attachment)

    return this.#createLink(owner, blob, { ownerKey: createAttachmentOwnerKey(owner) })
  }

  async createCollectionItem(
    owner: AttachmentOwner,
    attachment: Attachment,
    position?: number
  ): Promise<AttachmentLinkModel> {
    if (!this.#scoped) return this.transaction(owner, (store) => store.createCollectionItem(owner, attachment, position))
    const items = await this.listCollection(owner)
    const target = normalizePosition(position, items.length)
    const blob = await this.#createBlob(attachment)

    await this.#shiftCollection(items, target, 1)
    return this.#createLink(owner, blob, { position: target })
  }

  async createOriginalLink(owner: AttachmentOwner, attachmentId: string): Promise<AttachmentLinkModel> {
    if (!this.#scoped) return this.transaction(owner, (store) => store.createOriginalLink(owner, attachmentId))
    await this.#lockBlob(attachmentId)
    const blob = await this.#findBlobOrFail(attachmentId)
    return this.#createLink(owner, blob, { ownerKey: createAttachmentOwnerKey(owner) })
  }

  async createCollectionLink(
    owner: AttachmentOwner,
    attachmentId: string,
    position?: number
  ): Promise<AttachmentLinkModel> {
    if (!this.#scoped) return this.transaction(owner, (store) => store.createCollectionLink(owner, attachmentId, position))
    await this.#lockBlob(attachmentId)
    const items = await this.listCollection(owner)
    const target = normalizePosition(position, items.length)
    const blob = await this.#findBlobOrFail(attachmentId)

    await this.#shiftCollection(items, target, 1)
    return this.#createLink(owner, blob, { position: target })
  }

  createVariant(
    original: AttachmentModel,
    key: string,
    attachment: Attachment
  ): Promise<AttachmentModel> {
    if (!this.#scoped) return this.#variantTransaction(original.id, (store) => store.createVariant(original, key, attachment))
    return this.#createBlob(attachment, { parentId: original.id, variantKey: key })
  }

  /**
   * Updates an existing variant in one database write when it has the same key.
   * The previous file is returned for cleanup only after that write succeeds.
   */
  async replaceVariant(
    original: AttachmentModel,
    key: string,
    attachment: Attachment
  ): Promise<ReplacedLucidVariant> {
    assertTableAttachmentReference(attachment)
    if (!this.#scoped) return this.#variantTransaction(original.id, (store) => store.replaceVariant(original, key, attachment))
    const existing = await this.#first(this.#blobQuery()
      .where('parent_id', original.id)
      .where('variant_key', key))

    if (!existing) {
      return { variant: await this.createVariant(original, key, attachment), replaced: undefined }
    }

    const replaced = existing.toAttachment()
    existing.disk = attachment.disk
    existing.path = attachment.path
    existing.name = attachment.name
    existing.originalName = attachment.originalName
    existing.mimeType = attachment.mimeType
    existing.extname = attachment.extname
    existing.size = attachment.size
    existing.blurhash = attachment.blurhash ?? null
    existing.metadata = attachment.metadata ?? null
    await existing.save()
    markAttachmentPersisted(attachment)

    return { variant: existing, replaced }
  }

  async releaseOwner(original: AttachmentLinkModel): Promise<void> {
    original.ownerKey = null
    await original.save()
  }

  async restoreOwner(original: AttachmentLinkModel): Promise<void> {
    original.ownerKey = createAttachmentOwnerKey({
      type: original.attachableType,
      id: original.attachableId,
      field: original.field,
    })
    await original.save()
  }

  findOriginal(owner: AttachmentOwner): Promise<AttachmentLinkModel | null> {
    return this.#first(this.#linkQuery()
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
      .where('field', owner.field)
      .whereNotNull('owner_key'))
  }

  listCollection(owner: AttachmentOwner): Promise<AttachmentLinkModel[]> {
    return this.#linkQuery()
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
      .where('field', owner.field)
      .whereNull('owner_key')
      .orderBy('position', 'asc')
  }

  findCollectionItem(owner: AttachmentOwner, id: string): Promise<AttachmentLinkModel | null> {
    return this.#first(this.#linkQuery()
      .where('id', id)
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
      .where('field', owner.field)
      .whereNull('owner_key'))
  }

  async removeCollectionItem(
    owner: AttachmentOwner,
    item: AttachmentLinkModel
  ): Promise<AttachmentModel[]> {
    if (!this.#scoped) return this.transaction(owner, (store) => store.removeCollectionItem(owner, item))
    const removed = await this.remove(item)
    await this.#normalizeCollection(owner)
    return removed
  }

  async moveCollectionItem(
    owner: AttachmentOwner,
    id: string,
    position: number
  ): Promise<AttachmentLinkModel[]> {
    if (!this.#scoped) return this.transaction(owner, (store) => store.moveCollectionItem(owner, id, position))
    const items = await this.listCollection(owner)
    const source = items.findIndex((item) => item.id === id)

    if (source === -1) {
      throw new AttachmentValidationError(`Attachment link "${id}" does not belong to this collection`)
    }

    const target = normalizePosition(position, items.length - 1)

    if (source === target) {
      return items
    }

    const [item] = items.splice(source, 1)
    items.splice(target, 0, item!)
    await this.#reorderCollection(items)

    return items
  }

  findById(id: string): Promise<AttachmentModel | null> {
    return this.#first(this.#blobQuery().where('id', id))
  }

  async findByOwner(owner: AttachmentOwner): Promise<LucidAttachmentWithVariants | null> {
    const original = await this.findOriginal(owner)

    if (!original) {
      return null
    }

    return {
      original,
      variants: await this.listVariants(original.attachmentId),
    }
  }

  listVariants(originalId: string): Promise<AttachmentModel[]> {
    return this.#blobQuery().where('parent_id', originalId)
  }

  /**
   * Deletes a link and returns blobs that became unreferenced and were removed.
   */
  async remove(link: AttachmentLinkModel, owner?: AttachmentOwner): Promise<AttachmentModel[]> {
    if (!this.#scoped) return this.transaction(owner ?? { type: link.attachableType, id: link.attachableId, field: link.field }, (store) => store.remove(link))
    await this.#lockBlob(link.attachmentId)
    const attachment = await this.findById(link.attachmentId)
    await this.#linkModel.query({ client: this.#client! }).where('id', link.id).delete()

    if (!attachment || (await this.#first(this.#linkQuery().where('attachment_id', attachment.id)))) {
      return []
    }

    const variants = await this.listVariants(attachment.id)
    // Older installations may already have links directly referencing variants.
    if (variants.length && await this.#first(this.#linkQuery().whereIn('attachment_id', variants.map((variant) => variant.id)))) {
      throw new AttachmentValidationError('Cannot remove an original while its variants have owner links')
    }
    // SQL Server forbids the self-referencing cascade. Both deletes remain atomic.
    if (this.#client?.dialect.name === 'mssql' && variants.length) {
      await this.#blobModel.query({ client: this.#client }).where('parent_id', attachment.id).delete()
    }
    await attachment.delete()

    return [attachment, ...variants]
  }

  listOwnerLinks(owner: AttachmentOwner): Promise<AttachmentLinkModel[]> {
    return this.#linkQuery()
      .where('attachable_type', owner.type)
      .where('attachable_id', owner.id)
  }

  async #createBlob(
    attachment: Attachment,
    options: { parentId?: string; variantKey?: string } = {}
  ): Promise<AttachmentModel> {
    assertTableAttachmentReference(attachment)
    const blob = await this.#blobModel.create(
      {
        ...toPersistedAttachment(attachment),
        parentId: options.parentId ?? null,
        variantKey: options.variantKey ?? null,
        blurhash: attachment.blurhash ?? null,
        metadata: attachment.metadata ?? null,
      },
      this.#client ? { client: this.#client } : undefined
    )

    markAttachmentPersisted(attachment)
    return blob
  }

  async #findBlobOrFail(id: string): Promise<AttachmentModel> {
    const blob = await this.findById(id)

    if (!blob) {
      throw new AttachmentNotFoundError(id)
    }

    if (blob.parentId !== null) {
      throw new AttachmentValidationError('Only original attachments can be linked to an owner')
    }

    return blob
  }

  async #createLink(
    owner: AttachmentOwner,
    attachment: AttachmentModel,
    options: { ownerKey?: string; position?: number } = {}
  ): Promise<AttachmentLinkModel> {
    const link = await this.#linkModel.create(
      {
        id: this.#createLinkId(),
        attachableType: owner.type,
        attachableId: owner.id,
        field: owner.field,
        ownerKey: options.ownerKey ?? null,
        position: options.position ?? null,
        attachmentId: attachment.id,
      },
      this.#client ? { client: this.#client } : undefined
    )

    const persisted = await this.#first(this.#linkQuery().where('id', link.id))
    if (!persisted) throw new AttachmentNotFoundError(link.id)
    return persisted
  }

  async #normalizeCollection(owner: AttachmentOwner): Promise<void> {
    await this.#reorderCollection(await this.listCollection(owner))
  }

  #blobQuery() {
    const query = this.#blobModel.query(this.#client ? { client: this.#client } : undefined)
    return this.#scoped && !this.#isSqlite ? query.forUpdate() : query
  }

  #linkQuery() {
    const query = this.#linkModel
      .query(this.#client ? { client: this.#client } : undefined)
      .preload('attachment')
    return this.#scoped && !this.#isSqlite ? query.forUpdate() : query
  }

  async #shiftCollection(
    items: readonly AttachmentLinkModel[],
    from: number,
    amount: number
  ): Promise<void> {
    for (const item of [...items].reverse()) {
      if ((item.position ?? 0) < from) {
        continue
      }

      item.position = (item.position ?? 0) + amount
      await item.save()
    }
  }

  async #reorderCollection(items: readonly AttachmentLinkModel[]): Promise<void> {
    for (const [position, item] of items.entries()) {
      if (item.position === position) continue
      item.position = position
      await item.save()
    }
  }

  async #first<T>(query: { first(): Promise<T | null>; exec(): Promise<T[]>; whereRaw(sql: string): unknown }): Promise<T | null> {
    // Knex wraps Oracle LIMIT in a subquery, where FOR UPDATE is invalid.
    if (this.#client?.dialect.name === 'oracledb') {
      query.whereRaw('rownum <= 1')
      return (await query.exec())[0] ?? null
    }
    return query.first()
  }

  async #lockBlob(id: string): Promise<void> {
    await this.#blobModel.query({ client: this.#client! }).where('id', id).update({ id })
  }

  #variantTransaction<T>(id: string, callback: (store: LucidAttachmentStore) => Promise<T>): Promise<T> {
    return attachmentTransaction(this.#client ?? this.#blobModel.$adapter.modelConstructorClient(this.#blobModel), async (client) => {
      const store = new LucidAttachmentStore(this.#blobModel, { client, linkModel: this.#linkModel })
      store.#scoped = true
      await store.#lockBlob(id)
      await store.#findBlobOrFail(id)
      return callback(store)
    })
  }

  async #lockOwner(owner: AttachmentOwner): Promise<void> {
    const client = this.#client!
    const model = owner.model as LucidRow | undefined
    if (model?.$getQueryFor) {
      if (model.$isDeleted) return // Its DELETE already holds the row lock in the owner transaction.
      const Model = model.constructor as LucidModel
      const query = model.$getQueryFor('refresh', client)
      if (this.#isSqlite) {
        await model.$getQueryFor('update', client).update({ [Model.primaryKey]: model.$primaryKeyValue })
      } else query.forUpdate()
      if (!await this.#first(query)) throw new AttachmentValidationError('Attachment owner no longer exists')
      return
    }
    if (owner.lock) {
      const { table, column, value } = owner.lock
      const query = client.from(table).where(column, value)
      if (this.#isSqlite) await query.clone().update({ [column]: value })
      else query.forUpdate()
      if (!await this.#first(query)) throw new AttachmentValidationError('Attachment owner lock row does not exist')
      return
    }
    if (this.#isSqlite) {
      // Even an empty UPDATE reserves SQLite's writer before any collection read.
      await client.from(this.#linkModel.table).whereRaw('1 = 0').update({ position: 0 })
      return
    }
    throw new AttachmentConfigurationError('Concurrent attachment mutations require an owner model or owner.lock pointing to an existing row')
  }
}

function normalizePosition(position: number | undefined, maximum: number): number {
  if (position === undefined) {
    return maximum
  }

  if (!Number.isSafeInteger(position) || position < 0) {
    throw new AttachmentValidationError('Attachment collection positions must be non-negative integers')
  }

  return Math.min(position, maximum)
}
