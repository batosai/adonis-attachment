/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import {
  isAttachmentDraft,
  type Attachment,
  type AttachmentDraft,
  type CreateAttachmentInput,
} from './attachment.js'
import type { AttachmentService } from './attachment_service.js'
import type { AttachmentPersistenceOptions } from './attachment_options.js'
import {
  hasAttachmentTransactions,
  type AttachmentOwner,
  type AttachmentEntry,
  type AttachmentRecord,
  type AttachmentPersistence,
  type AttachmentCollectionPersistence,
  type AttachmentLinkPersistence,
} from './attachment_persistence.js'
import { AttachmentConfigurationError, AttachmentConflictError } from '../errors.js'
import type { AttachmentEventContext } from '../events/attachment_events.js'

export type AttachmentFileService = Pick<AttachmentService, 'create' | 'remove'> &
  Partial<Pick<AttachmentService, 'createDraft' | 'getVariantKeys' | 'getVariantMetadataEnabled' | 'getMetadataMode' | 'scheduleMetadataExtraction' | 'scheduleVariantGeneration'>>

/** Retains the locations needed to retry storage cleanup after SQL has committed. */
export class AttachmentFileCleanupError extends AggregateError {
  constructor(readonly attachments: readonly Attachment[], errors: unknown[]) {
    super(errors, 'Attachment file cleanup failed')
    this.name = 'AttachmentFileCleanupError'
  }
}
/** Shared lifecycle; adapters own persistence, transactions and result objects. */
export class AttachmentLifecycleService<
  Entry extends AttachmentEntry = AttachmentEntry,
  Record extends AttachmentRecord = AttachmentRecord,
> {
  readonly #attachments: AttachmentFileService
  readonly #store: AttachmentPersistence<Entry, Record>

  constructor(attachments: AttachmentFileService, store: AttachmentPersistence<Entry, Record>) {
    hasAttachmentTransactions(store)
    this.#attachments = attachments
    this.#store = store
  }

  get #needsTransaction(): boolean {
    return hasAttachmentTransactions(this.#store) && !this.#store.isScoped
  }

  transaction<T>(owner: AttachmentOwner, callback: (service: AttachmentLifecycleService<Entry, Record>) => Promise<T>): Promise<T> {
    if (hasAttachmentTransactions(this.#store) && !this.#store.isScoped) {
      return this.#store.transaction(owner, (store) => {
        if (!hasAttachmentTransactions(store) || !store.isScoped) {
          throw new AttachmentConfigurationError('Attachment transactions must provide a transaction-scoped store')
        }
        return callback(this.createScopedService(this.#attachments, store))
      })
    }
    return callback(this)
  }

  protected createScopedService(
    attachments: AttachmentFileService,
    store: AttachmentPersistence<Entry, Record>
  ): AttachmentLifecycleService<Entry, Record> {
    return new AttachmentLifecycleService(attachments, store)
  }

  get(owner: AttachmentOwner): Promise<Entry | null> {
    return this.#store.findOriginal(owner)
  }

  async attach(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    options?: AttachmentPersistenceOptions<any>
  ): Promise<Entry> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.attach(owner, input, options))
    const persisted = await this.#persist(owner, input, options)

    let original: Entry

    try {
      original = await this.#store.createOriginal(owner, persisted.attachment)
    } catch (error) {
      await this.#discardFailed(persisted)
      throw error
    }

    this.#completePersistence(owner, persisted)

    await this.#scheduleVariants(owner, persisted, options)
    await this.#scheduleMetadata(owner, persisted, options)
    return original
  }

  async replace(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    options?: AttachmentPersistenceOptions<any>
  ): Promise<Entry> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.replace(owner, input, options))
    const previous = await this.#store.findOriginal(owner)

    if (!previous) {
      return this.attach(owner, input, options)
    }

    const protectedFiles = [previous.toAttachment(), ...(await this.#store.listVariants(previous.attachmentId)).map((item) => item.toAttachment())]
    const persisted = await this.#persist(owner, input, options, protectedFiles)
    let current: Entry

    try {
      await this.#store.releaseOwner(previous)
      current = await this.#store.createOriginal(owner, persisted.attachment)
    } catch (error) {
      if (persisted.managed) throw error
      await this.#store.restoreOwner(previous).catch(() => undefined)
      await this.#discardPersisted(persisted)
      throw error
    }

    let removed: Record[]
    try {
      removed = await this.#store.remove(previous)
    } catch (error) {
      if (persisted.managed) throw error
      await this.#store.remove(current).catch(() => undefined)
      await this.#store.restoreOwner(previous).catch(() => undefined)
      await this.#discardPersisted(persisted)
      throw error
    }

    this.#completePersistence(owner, persisted)
    await this.#removeOnCommit(owner, removed.map((item) => item.toAttachment()))
    await this.#scheduleVariants(owner, persisted, options)
    await this.#scheduleMetadata(owner, persisted, options)

    return current
  }

  async detach(owner: AttachmentOwner): Promise<void> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.detach(owner))
    const original = await this.#store.findOriginal(owner)

    if (!original) {
      return
    }

    const removed = await this.#store.remove(original)
    await this.#removeOnCommit(owner, removed.map((item) => item.toAttachment()))
  }

  async listVariants(owner: AttachmentOwner): Promise<Record[]> {
    const original = await this.#store.findOriginal(owner)

    return original ? this.#store.listVariants(original.attachmentId) : []
  }

  async purgeOwner(owner: AttachmentOwner): Promise<void> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.purgeOwner(owner))
    for (const link of await this.#store.listOwnerLinks(owner)) {
      const removed = await this.#store.remove(link)
      await this.#removeOnCommit(owner, removed.map((attachment) => attachment.toAttachment()))
    }
  }

  async add(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    position?: number,
    options?: AttachmentPersistenceOptions<any>
  ): Promise<Entry> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.add(owner, input, position, options))
    const created = await this.#add(owner, input, position, options)
    this.#completePersistence(owner, created.persisted)
    await this.#scheduleVariants(owner, created.persisted, options)
    await this.#scheduleMetadata(owner, created.persisted, options)

    return created.item
  }

  async #add(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    position: number | undefined,
    options: AttachmentPersistenceOptions<any> | undefined,
    protectedLocations?: readonly Attachment[]
  ): Promise<{ item: Entry; persisted: PersistedAttachment }> {
    const persisted = await this.#persist(owner, input, options, protectedLocations)

    try {
      const item = await this.#collectionStore().createCollectionItem(
        owner,
        persisted.attachment,
        position
      )
      return { item, persisted }
    } catch (error) {
      await this.#discardFailed(persisted)
      throw error
    }
  }

  attachExisting(owner: AttachmentOwner, attachmentId: string): Promise<Entry> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.attachExisting(owner, attachmentId))
    return this.#linkStore().createOriginalLink(owner, attachmentId)
  }

  addExisting(
    owner: AttachmentOwner,
    attachmentId: string,
    position?: number
  ): Promise<Entry> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.addExisting(owner, attachmentId, position))
    return this.#linkStore().createCollectionLink(owner, attachmentId, position)
  }

  listCollection(owner: AttachmentOwner): Promise<Entry[]> {
    return this.#collectionStore().listCollection(owner)
  }

  async removeCollectionItem(owner: AttachmentOwner, id: string): Promise<boolean> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.removeCollectionItem(owner, id))
    const item = await this.#collectionStore().findCollectionItem(owner, id)

    if (!item) {
      return false
    }

    await this.#detachCollectionItem(owner, item)
    return true
  }

  async clearCollection(owner: AttachmentOwner): Promise<void> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.clearCollection(owner))
    for (const item of await this.#collectionStore().listCollection(owner)) {
      await this.#detachCollectionItem(owner, item)
    }
  }

  async replaceCollection(
    owner: AttachmentOwner,
    inputs: readonly (CreateAttachmentInput | AttachmentDraft)[],
    options?: AttachmentPersistenceOptions<any>
  ): Promise<Entry[]> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.replaceCollection(owner, inputs, options))
    const previous = await this.#collectionStore().listCollection(owner)
    const protectedFiles = previous.map((item) => item.toAttachment())
    const created: Array<{ item: Entry; persisted: PersistedAttachment }> = []

    try {
      for (const input of inputs) {
        created.push(await this.#add(owner, input, undefined, options, protectedFiles))
        protectedFiles.push(created.at(-1)!.persisted.attachment)
      }
    } catch (error) {
      for (const { item, persisted } of created) {
        if (persisted.managed) continue
        await this.#collectionStore().removeCollectionItem(owner, item)
        await this.#discardPersisted(persisted)
      }
      throw error
    }

    for (const { persisted } of created) {
      this.#completePersistence(owner, persisted)
    }

    for (const item of previous) {
      await this.#detachCollectionItem(owner, item)
    }

    for (const item of created) {
      await this.#scheduleVariants(owner, item.persisted, options)
      await this.#scheduleMetadata(owner, item.persisted, options)
    }

    return this.#collectionStore().listCollection(owner)
  }

  moveCollectionItem(
    owner: AttachmentOwner,
    id: string,
    position: number
  ): Promise<Entry[]> {
    if (this.#needsTransaction) return this.transaction(owner, (service) => service.moveCollectionItem(owner, id, position))
    return this.#collectionStore().moveCollectionItem(owner, id, position)
  }

  async #removeStoredFile(attachment: Attachment): Promise<void> {
    await this.#attachments.remove(attachment)
  }

  async #removeOnCommit(owner: AttachmentOwner, attachments: readonly Attachment[]): Promise<void> {
    await this.#afterCommit(owner, () => this.#removeStoredFiles(attachments))
  }

  async #discardPersisted(persisted: PersistedAttachment): Promise<void> {
    try {
      await this.#removeStoredFiles([persisted.attachment])
    } finally {
      persisted.checkpoint?.rollback()
    }
  }

  async #discardFailed(persisted: PersistedAttachment): Promise<void> {
    if (!persisted.managed) await this.#discardPersisted(persisted)
  }

  #completePersistence(owner: AttachmentOwner, persisted: PersistedAttachment): void {
    if (persisted.managed) return
    if (hasAttachmentTransactions(this.#store) && this.#store.isScoped) {
      persisted.managed = true
      this.#store.afterRollback(() => this.#discardPersisted(persisted))
      this.#store.afterCommit(() => persisted.checkpoint?.release())
      return
    }
    const transaction = getOwnerTransaction(owner)

    if (transaction) {
      transaction.after('rollback', () => this.#discardPersisted(persisted))
      transaction.after('commit', () => persisted.checkpoint?.release())
    } else {
      persisted.checkpoint?.release()
    }
  }

  async #removeStoredFiles(attachments: readonly Attachment[]): Promise<void> {
    const results = await Promise.allSettled(attachments.map((attachment) => this.#removeStoredFile(attachment)))
    const failed: Attachment[] = []
    const errors: unknown[] = []
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failed.push(attachments[index]!)
        errors.push(result.reason)
      }
    })
    if (errors.length) throw new AttachmentFileCleanupError(failed, errors)
  }

  async #afterCommit(owner: AttachmentOwner, callback: () => Promise<void>): Promise<void> {
    if (hasAttachmentTransactions(this.#store) && this.#store.isScoped) {
      this.#store.afterCommit(callback)
      return
    }
    const transaction = getOwnerTransaction(owner)

    if (transaction) {
      transaction.after('commit', callback)
      return
    }

    await callback()
  }

  async #detachCollectionItem(owner: AttachmentOwner, item: Entry): Promise<void> {
    const removed = await this.#collectionStore().removeCollectionItem(owner, item)
    await this.#removeOnCommit(owner, removed.map((attachment) => attachment.toAttachment()))
  }

  #collectionStore(): AttachmentCollectionPersistence<Entry, Record> {
    const store = this.#store

    if (
      !store.createCollectionItem ||
      !store.findCollectionItem ||
      !store.listCollection ||
      !store.moveCollectionItem ||
      !store.removeCollectionItem
    ) {
      throw new AttachmentConfigurationError(
        'Lucid attachment collection operations require a collection-capable store'
      )
    }

    return store as AttachmentCollectionPersistence<Entry, Record>
  }

  #linkStore(): AttachmentLinkPersistence<Entry> {
    const store = this.#store

    if (!store.createOriginalLink || !store.createCollectionLink) {
      throw new AttachmentConfigurationError(
        'Lucid attachment link operations require a link-capable store'
      )
    }

    return store as AttachmentLinkPersistence<Entry>
  }

  async #persist(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    options?: AttachmentPersistenceOptions<any>,
    protectedLocations?: readonly Attachment[]
  ): Promise<PersistedAttachment> {
    const draft = isAttachmentDraft(input) ? input : this.#attachments.createDraft?.(input)
    if (draft) {
      if (draft.isPersisted && protectedLocations?.some((file) => file.disk === draft.disk && file.path === draft.path)) {
        throw new AttachmentConflictError('Replacement drafts must be staged before persisting a conflicting file')
      }
      const checkpoint = draft.retainForRollback()
      try {
        const persisted = {
          draft,
          checkpoint,
          attachment: await draft.persist({
            ...(options ? { options } : {}),
            context: { model: owner.model, field: owner.field },
            ...(protectedLocations ? { protectedLocations } : {}),
          }),
        }
        if (hasAttachmentTransactions(this.#store) && this.#store.isScoped) this.#completePersistence(owner, persisted)
        return persisted
      } catch (error) {
        checkpoint.release()
        throw error
      }
    }

    const persisted = { attachment: await this.#attachments.create(input as CreateAttachmentInput) }
    if (hasAttachmentTransactions(this.#store) && this.#store.isScoped) this.#completePersistence(owner, persisted)
    return persisted
  }

  async #scheduleVariants(
    owner: AttachmentOwner,
    persisted: PersistedAttachment,
    options: AttachmentPersistenceOptions<any> | undefined
  ): Promise<void> {
    if (!persisted.draft || !this.#attachments.getVariantKeys || !this.#attachments.scheduleVariantGeneration) {
      return
    }

    const keys = this.#attachments.getVariantKeys(persisted.draft, options)

    if (!keys?.length) {
      return
    }

    const meta = this.#attachments.getVariantMetadataEnabled?.(persisted.draft, options)

    const eventContext = this.#eventContext(owner)
    await this.#afterCommit(owner, () => this.#attachments.scheduleVariantGeneration!(persisted.attachment, keys, meta, eventContext))
  }

  async #scheduleMetadata(
    owner: AttachmentOwner,
    persisted: PersistedAttachment,
    options: AttachmentPersistenceOptions<any> | undefined
  ): Promise<void> {
    if (!persisted.draft || !this.#attachments.getMetadataMode || !this.#attachments.scheduleMetadataExtraction) {
      return
    }
    if (this.#attachments.getMetadataMode(persisted.draft, options) !== 'deferred') {
      return
    }

    const eventContext = this.#eventContext(owner)
    await this.#afterCommit(owner, () => this.#attachments.scheduleMetadataExtraction!(persisted.attachment, eventContext))
  }

  #eventContext(owner: AttachmentOwner): AttachmentEventContext {
    const model = owner.model as { constructor?: { primaryKey?: string } } | undefined

    return {
      tableName: owner.type,
      attributeName: owner.field,
      primary: {
        key: model?.constructor?.primaryKey ?? 'id',
        value: owner.id,
      },
    }
  }
}

type PersistedAttachment = {
  managed?: boolean
  attachment: Attachment
  draft?: AttachmentDraft
  checkpoint?: ReturnType<AttachmentDraft['retainForRollback']>
}

function getOwnerTransaction(owner: AttachmentOwner): {
  after(event: 'commit' | 'rollback', callback: () => void | Promise<void>): void
} | null {
  const model = owner.model as
    | {
        $trx?: {
          after(event: 'commit' | 'rollback', callback: () => void | Promise<void>): void
        }
      }
    | undefined

  return model?.$trx ?? null
}
