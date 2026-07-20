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
} from '../../core/attachment.js'
import type { AttachmentService } from '../../core/attachment_service.js'
import type { AttachmentPersistenceOptions } from '../../core/attachment_options.js'
import type { AttachmentOwner } from './attachment_owner.js'
import { AttachmentModel } from './attachment_model.js'
import { LucidAttachmentStore } from './lucid_attachment_store.js'

export type AttachmentFileService = Pick<AttachmentService, 'create' | 'remove'> &
  Partial<Pick<AttachmentService, 'createDraft'>>
export type LucidAttachmentPersistence = Pick<
  LucidAttachmentStore,
  'createOriginal' | 'findOriginal' | 'listVariants' | 'releaseOwner' | 'restoreOwner' | 'remove'
> &
  Partial<
    Pick<
      LucidAttachmentStore,
      | 'createCollectionItem'
      | 'findCollectionItem'
      | 'listCollection'
      | 'moveCollectionItem'
      | 'removeCollectionItem'
    >
  >

export class LucidAttachmentLifecycleService {
  readonly #attachments: AttachmentFileService
  readonly #store: LucidAttachmentPersistence

  constructor(attachments: AttachmentFileService, store: LucidAttachmentPersistence) {
    this.#attachments = attachments
    this.#store = store
  }

  get(owner: AttachmentOwner): Promise<AttachmentModel | null> {
    return this.#store.findOriginal(owner)
  }

  async attach(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    options?: AttachmentPersistenceOptions<any>
  ): Promise<AttachmentModel> {
    const attachment = await this.#persist(owner, input, options)

    try {
      const original = await this.#store.createOriginal(owner, attachment)
      this.#removeOnRollback(owner, [attachment])
      return original
    } catch (error) {
      await this.#removeStoredFile(attachment)
      throw error
    }
  }

  async replace(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    options?: AttachmentPersistenceOptions<any>
  ): Promise<AttachmentModel> {
    const previous = await this.#store.findOriginal(owner)

    if (!previous) {
      return this.attach(owner, input, options)
    }

    const previousVariants = await this.#store.listVariants(previous.id)

    const attachment = await this.#persist(owner, input, options)
    let current: AttachmentModel

    try {
      await this.#store.releaseOwner(previous)
      current = await this.#store.createOriginal(owner, attachment)
    } catch (error) {
      await this.#store.restoreOwner(previous).catch(() => undefined)
      await this.#removeStoredFile(attachment)
      throw error
    }

    try {
      await this.#store.remove(previous)
    } catch (error) {
      await this.#store.remove(current).catch(() => undefined)
      await this.#store.restoreOwner(previous).catch(() => undefined)
      await this.#removeStoredFile(current.toAttachment())
      throw error
    }

    await this.#removeOnCommit(owner, [
      previous.toAttachment(),
      ...previousVariants.map((variant) => variant.toAttachment()),
    ])
    this.#removeOnRollback(owner, [current.toAttachment()])

    return current
  }

  async detach(owner: AttachmentOwner): Promise<void> {
    const original = await this.#store.findOriginal(owner)

    if (!original) {
      return
    }

    const variants = await this.#store.listVariants(original.id)
    await this.#store.remove(original)

    await this.#removeOnCommit(owner, [
      original.toAttachment(),
      ...variants.map((variant) => variant.toAttachment()),
    ])
  }

  async listVariants(owner: AttachmentOwner): Promise<AttachmentModel[]> {
    const original = await this.#store.findOriginal(owner)

    return original ? this.#store.listVariants(original.id) : []
  }

  async add(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    position?: number,
    options?: AttachmentPersistenceOptions<any>
  ): Promise<AttachmentModel> {
    const attachment = await this.#persist(owner, input, options)

    try {
      const item = await this.#collectionStore().createCollectionItem(owner, attachment, position)
      this.#removeOnRollback(owner, [attachment])
      return item
    } catch (error) {
      await this.#removeStoredFile(attachment)
      throw error
    }
  }

  listCollection(owner: AttachmentOwner): Promise<AttachmentModel[]> {
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
  ): Promise<AttachmentModel[]> {
    const previous = await this.#collectionStore().listCollection(owner)
    const created: AttachmentModel[] = []

    try {
      for (const input of inputs) {
        created.push(await this.add(owner, input, undefined, options))
      }
    } catch (error) {
      await Promise.all(created.map((item) => this.#detachCollectionItem(owner, item)))
      throw error
    }

    for (const item of previous) {
      await this.#detachCollectionItem(owner, item)
    }

    return this.#collectionStore().listCollection(owner)
  }

  moveCollectionItem(owner: AttachmentOwner, id: string, position: number): Promise<AttachmentModel[]> {
    return this.#collectionStore().moveCollectionItem(owner, id, position)
  }

  async #removeStoredFile(attachment: Attachment): Promise<void> {
    await this.#attachments.remove(attachment)
  }

  async #removeOnCommit(owner: AttachmentOwner, attachments: readonly Attachment[]): Promise<void> {
    const transaction = getOwnerTransaction(owner)

    if (transaction) {
      transaction.after('commit', () => this.#removeStoredFiles(attachments))
      return
    }

    await this.#removeStoredFiles(attachments)
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

  async #detachCollectionItem(owner: AttachmentOwner, item: AttachmentModel): Promise<void> {
    const variants = await this.#store.listVariants(item.id)
    await this.#collectionStore().removeCollectionItem(owner, item)

    await this.#removeOnCommit(owner, [
      item.toAttachment(),
      ...variants.map((variant) => variant.toAttachment()),
    ])
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

  async #persist(
    owner: AttachmentOwner,
    input: CreateAttachmentInput | AttachmentDraft,
    options?: AttachmentPersistenceOptions<any>
  ): Promise<Attachment> {
    if (isAttachmentDraft(input)) {
      return input.persist({
        ...(options ? { options } : {}),
        context: { model: owner.model, field: owner.field },
      })
    }

    if (this.#attachments.createDraft) {
      return this.#attachments
        .createDraft(input)
        .persist({
          ...(options ? { options } : {}),
          context: { model: owner.model, field: owner.field },
        })
    }

    return this.#attachments.create(input)
  }
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
