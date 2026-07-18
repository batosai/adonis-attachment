import type { Attachment, CreateAttachmentInput } from '../../core/attachment.js'
import type { AttachmentService } from '../../core/attachment_service.js'
import type { AttachmentOwner } from './attachment_owner.js'
import { AttachmentModel } from './attachment_model.js'
import { LucidAttachmentStore } from './lucid_attachment_store.js'

export type AttachmentFileService = Pick<AttachmentService, 'create' | 'remove'>
export type LucidAttachmentPersistence = Pick<
  LucidAttachmentStore,
  'createOriginal' | 'findOriginal' | 'listVariants' | 'remove'
>

export class LucidAttachmentLifecycleService {
  readonly #attachments: AttachmentFileService
  readonly #store: LucidAttachmentPersistence

  constructor(attachments: AttachmentFileService, store: LucidAttachmentPersistence) {
    this.#attachments = attachments
    this.#store = store
  }

  async attach(owner: AttachmentOwner, input: CreateAttachmentInput): Promise<AttachmentModel> {
    const attachment = await this.#attachments.create(input)

    try {
      return await this.#store.createOriginal(owner, attachment)
    } catch (error) {
      await this.#removeStoredFile(attachment)
      throw error
    }
  }

  async replace(owner: AttachmentOwner, input: CreateAttachmentInput): Promise<AttachmentModel> {
    const previous = await this.#store.findOriginal(owner)
    const current = await this.attach(owner, input)

    if (!previous) {
      return current
    }

    try {
      await this.#store.remove(previous)
    } catch (error) {
      await this.#store.remove(current).catch(() => undefined)
      await this.#removeStoredFile(current.toAttachment())
      throw error
    }

    await this.#removeStoredFile(previous.toAttachment())

    return current
  }

  async detach(owner: AttachmentOwner): Promise<void> {
    const original = await this.#store.findOriginal(owner)

    if (!original) {
      return
    }

    const variants = await this.#store.listVariants(original.id)
    await this.#store.remove(original)

    await Promise.all([
      this.#removeStoredFile(original.toAttachment()),
      ...variants.map((variant) => this.#removeStoredFile(variant.toAttachment())),
    ])
  }

  async #removeStoredFile(attachment: Attachment): Promise<void> {
    await this.#attachments.remove(attachment)
  }
}
