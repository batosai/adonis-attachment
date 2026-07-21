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
} from '../../../core/attachment.js'
import type { AttachmentService } from '../../../core/attachment_service.js'
import type { AttachmentPersistenceOptions } from '../../../core/attachment_options.js'
import type { AttachmentOwner } from '../relations/attachment_owner.js'
import { AttachmentLinkModel } from '../models/attachment_link_model.js'
import { AttachmentModel } from '../models/attachment_model.js'
import { LucidAttachmentStore } from './lucid_attachment_store.js'

export type AttachmentFileService = Pick<AttachmentService, 'create' | 'remove'> &
  Partial<Pick<AttachmentService, 'createDraft' | 'getVariantKeys' | 'getVariantMetadataEnabled' | 'scheduleVariantGeneration'>>
export type LucidAttachmentPersistence = Pick<
  LucidAttachmentStore,
  | 'createOriginal'
  | 'findOriginal'
  | 'listVariants'
  | 'releaseOwner'
  | 'restoreOwner'
  | 'remove'
  | 'listOwnerLinks'
> &
  Partial<
    Pick<
      LucidAttachmentStore,
      | 'createCollectionItem'
      | 'findCollectionItem'
      | 'listCollection'
      | 'moveCollectionItem'
      | 'removeCollectionItem'
      | 'createOriginalLink'
      | 'createCollectionLink'
    >
  >

export class LucidAttachmentLifecycleService {
  readonly #attachments: AttachmentFileService
  readonly #store: LucidAttachmentPersistence

  constructor(attachments: AttachmentFileService, store: LucidAttachmentPersistence) {
    this.#attachments = attachments
    this.#store = store
  }

  get(owner: AttachmentOwner): Promise<AttachmentLinkModel | null> {
    return this.#store.findOriginal(owner)
  }

  async attach(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    options?: AttachmentPersistenceOptions<any>
  ): Promise<AttachmentLinkModel> {
    const persisted = await this.#persist(owner, input, options)

    let original: AttachmentLinkModel

    try {
      original = await this.#store.createOriginal(owner, persisted.attachment)
      this.#removeOnRollback(owner, [persisted.attachment])
    } catch (error) {
      await this.#removeStoredFile(persisted.attachment)
      throw error
    }

    await this.#scheduleVariants(owner, persisted, options)
    return original
  }

  async replace(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    options?: AttachmentPersistenceOptions<any>
  ): Promise<AttachmentLinkModel> {
    const previous = await this.#store.findOriginal(owner)

    if (!previous) {
      return this.attach(owner, input, options)
    }

    const persisted = await this.#persist(owner, input, options)
    let current: AttachmentLinkModel

    try {
      await this.#store.releaseOwner(previous)
      current = await this.#store.createOriginal(owner, persisted.attachment)
    } catch (error) {
      await this.#store.restoreOwner(previous).catch(() => undefined)
      await this.#removeStoredFile(persisted.attachment)
      throw error
    }

    try {
      const removed = await this.#store.remove(previous)
      await this.#removeOnCommit(owner, removed.map((item) => item.toAttachment()))
    } catch (error) {
      await this.#store.remove(current).catch(() => undefined)
      await this.#store.restoreOwner(previous).catch(() => undefined)
      await this.#removeStoredFile(current.toAttachment())
      throw error
    }

    this.#removeOnRollback(owner, [current.toAttachment()])
    await this.#scheduleVariants(owner, persisted, options)

    return current
  }

  async detach(owner: AttachmentOwner): Promise<void> {
    const original = await this.#store.findOriginal(owner)

    if (!original) {
      return
    }

    const removed = await this.#store.remove(original)
    await this.#removeOnCommit(owner, removed.map((item) => item.toAttachment()))
  }

  async listVariants(owner: AttachmentOwner): Promise<AttachmentModel[]> {
    const original = await this.#store.findOriginal(owner)

    return original ? this.#store.listVariants(original.attachmentId) : []
  }

  async purgeOwner(owner: AttachmentOwner): Promise<void> {
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
  ): Promise<AttachmentLinkModel> {
    const created = await this.#add(owner, input, position, options)
    await this.#scheduleVariants(owner, created.persisted, options)

    return created.item
  }

  async #add(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    position: number | undefined,
    options: AttachmentPersistenceOptions<any> | undefined
  ): Promise<{ item: AttachmentLinkModel; persisted: PersistedAttachment }> {
    const persisted = await this.#persist(owner, input, options)

    try {
      const item = await this.#collectionStore().createCollectionItem(
        owner,
        persisted.attachment,
        position
      )
      this.#removeOnRollback(owner, [persisted.attachment])
      return { item, persisted }
    } catch (error) {
      await this.#removeStoredFile(persisted.attachment)
      throw error
    }
  }

  attachExisting(owner: AttachmentOwner, attachmentId: string): Promise<AttachmentLinkModel> {
    return this.#linkStore().createOriginalLink(owner, attachmentId)
  }

  addExisting(
    owner: AttachmentOwner,
    attachmentId: string,
    position?: number
  ): Promise<AttachmentLinkModel> {
    return this.#linkStore().createCollectionLink(owner, attachmentId, position)
  }

  listCollection(owner: AttachmentOwner): Promise<AttachmentLinkModel[]> {
    return this.#collectionStore().listCollection(owner)
  }

  async removeCollectionItem(owner: AttachmentOwner, id: string): Promise<boolean> {
    const item = await this.#collectionStore().findCollectionItem(owner, id)

    if (!item) {
      return false
    }

    await this.#detachCollectionItem(owner, item)
    return true
  }

  async clearCollection(owner: AttachmentOwner): Promise<void> {
    for (const item of await this.#collectionStore().listCollection(owner)) {
      await this.#detachCollectionItem(owner, item)
    }
  }

  async replaceCollection(
    owner: AttachmentOwner,
    inputs: readonly (CreateAttachmentInput | AttachmentDraft)[],
    options?: AttachmentPersistenceOptions<any>
  ): Promise<AttachmentLinkModel[]> {
    const previous = await this.#collectionStore().listCollection(owner)
    const created: Array<{ item: AttachmentLinkModel; persisted: PersistedAttachment }> = []

    try {
      for (const input of inputs) {
        created.push(await this.#add(owner, input, undefined, options))
      }
    } catch (error) {
      await Promise.all(created.map(({ item }) => this.#detachCollectionItem(owner, item)))
      throw error
    }

    for (const item of previous) {
      await this.#detachCollectionItem(owner, item)
    }

    for (const item of created) {
      await this.#scheduleVariants(owner, item.persisted, options)
    }

    return this.#collectionStore().listCollection(owner)
  }

  moveCollectionItem(
    owner: AttachmentOwner,
    id: string,
    position: number
  ): Promise<AttachmentLinkModel[]> {
    return this.#collectionStore().moveCollectionItem(owner, id, position)
  }

  async #removeStoredFile(attachment: Attachment): Promise<void> {
    await this.#attachments.remove(attachment)
  }

  async #removeOnCommit(owner: AttachmentOwner, attachments: readonly Attachment[]): Promise<void> {
    await this.#afterCommit(owner, () => this.#removeStoredFiles(attachments))
  }

  #removeOnRollback(owner: AttachmentOwner, attachments: readonly Attachment[]): void {
    const transaction = getOwnerTransaction(owner)

    if (transaction) {
      transaction.after('rollback', () => this.#removeStoredFiles(attachments))
    }
  }

  #removeStoredFiles(attachments: readonly Attachment[]): Promise<void> {
    return Promise.all(attachments.map((attachment) => this.#removeStoredFile(attachment))).then(
      () => undefined
    )
  }

  async #afterCommit(owner: AttachmentOwner, callback: () => Promise<void>): Promise<void> {
    const transaction = getOwnerTransaction(owner)

    if (transaction) {
      transaction.after('commit', callback)
      return
    }

    await callback()
  }

  async #detachCollectionItem(owner: AttachmentOwner, item: AttachmentLinkModel): Promise<void> {
    const removed = await this.#collectionStore().removeCollectionItem(owner, item)
    await this.#removeOnCommit(owner, removed.map((attachment) => attachment.toAttachment()))
  }

  #collectionStore(): Required<
    Pick<
      LucidAttachmentStore,
      | 'createCollectionItem'
      | 'findCollectionItem'
      | 'listCollection'
      | 'moveCollectionItem'
      | 'removeCollectionItem'
    >
  > {
    const store = this.#store

    if (
      !store.createCollectionItem ||
      !store.findCollectionItem ||
      !store.listCollection ||
      !store.moveCollectionItem ||
      !store.removeCollectionItem
    ) {
      throw new Error('Lucid attachment collection operations require a collection-capable store')
    }

    return store as Required<
      Pick<
        LucidAttachmentStore,
        | 'createCollectionItem'
        | 'findCollectionItem'
        | 'listCollection'
        | 'moveCollectionItem'
        | 'removeCollectionItem'
      >
    >
  }

  #linkStore(): Required<
    Pick<LucidAttachmentStore, 'createOriginalLink' | 'createCollectionLink'>
  > {
    const store = this.#store

    if (!store.createOriginalLink || !store.createCollectionLink) {
      throw new Error('Lucid attachment link operations require a link-capable store')
    }

    return store as Required<
      Pick<LucidAttachmentStore, 'createOriginalLink' | 'createCollectionLink'>
    >
  }

  async #persist(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    options?: AttachmentPersistenceOptions<any>
  ): Promise<PersistedAttachment> {
    if (isAttachmentDraft(input)) {
      return {
        draft: input,
        attachment: await input.persist({
          ...(options ? { options } : {}),
          context: { model: owner.model, field: owner.field },
        }),
      }
    }

    if (this.#attachments.createDraft) {
      const draft = this.#attachments.createDraft(input)

      return {
        draft,
        attachment: await draft.persist({
          ...(options ? { options } : {}),
          context: { model: owner.model, field: owner.field },
        }),
      }
    }

    return { attachment: await this.#attachments.create(input) }
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

    await this.#afterCommit(owner, () => this.#attachments.scheduleVariantGeneration!(persisted.attachment, keys, meta))
  }
}

type PersistedAttachment = {
  attachment: Attachment
  draft?: AttachmentDraft
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
