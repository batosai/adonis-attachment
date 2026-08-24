/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentService } from '../../../core/attachment_service.js'
import type { Attachment } from '../../../core/attachment.js'
import type { VariantGenerationRequest, VariantGenerator } from '../../../core/attachment_job_processor.js'
import type { GeneratedVariant, VariantGenerationService } from '../../../variants/variant_generation_service.js'
import { AttachmentModel } from '../models/attachment_model.js'
import { LucidAttachmentStore } from './lucid_attachment_store.js'
import { AttachmentError } from '../../../errors.js'

export type LucidVariantGenerationServiceOptions = {
  generator: Pick<VariantGenerationService, 'generateAll'>
  attachments: Pick<AttachmentService, 'remove'> & Partial<Pick<AttachmentService, 'getMetadataMode' | 'scheduleMetadataExtraction'>>
  store: Pick<LucidAttachmentStore, 'findById' | 'createVariant'> & Partial<Pick<LucidAttachmentStore, 'replaceVariant'>>
}

export class LucidVariantGenerationService implements VariantGenerator {
  readonly #generator: Pick<VariantGenerationService, 'generateAll'>
  readonly #attachments: Pick<AttachmentService, 'remove'> & Partial<Pick<AttachmentService, 'getMetadataMode' | 'scheduleMetadataExtraction'>>
  readonly #store: Pick<LucidAttachmentStore, 'findById' | 'createVariant'> & Partial<Pick<LucidAttachmentStore, 'replaceVariant'>>

  constructor(options: LucidVariantGenerationServiceOptions) {
    this.#generator = options.generator
    this.#attachments = options.attachments
    this.#store = options.store
  }

  async generate(request: VariantGenerationRequest): Promise<void> {
    const original = await this.#store.findById(request.attachment.id)

    if (!original) {
      throw new PersistedAttachmentNotFoundError(request.attachment.id)
    }

    const variants = await this.#generator.generateAll(request)
    for (const variant of variants) {
      await this.#persist(original, variant, request.meta, request.mode)
    }
  }

  async #persist(
    original: AttachmentModel,
    variant: GeneratedVariant,
    meta: boolean | undefined,
    mode: 'create' | 'replace' | undefined
  ): Promise<void> {
    let persisted: { variant: AttachmentModel; replaced: Attachment | undefined }

    try {
      persisted = mode === 'replace' && this.#store.replaceVariant
        ? await this.#store.replaceVariant(original, variant.key, variant.attachment)
        : { variant: await this.#store.createVariant(original, variant.key, variant.attachment), replaced: undefined }
    } catch (error) {
      await this.#attachments.remove(variant.attachment)
      throw error
    }

    if (this.#attachments.getMetadataMode?.(
      undefined,
      meta !== undefined ? { meta } : undefined
    ) === 'deferred') {
      await this.#attachments.scheduleMetadataExtraction?.(
        persisted.variant.toAttachment?.() ?? variant.attachment
      )
    }

    await this.#removeReplacedVariant(persisted.replaced, variant.attachment)
  }

  async #removeReplacedVariant(
    replaced: Attachment | undefined,
    replacement: Attachment
  ): Promise<void> {
    if (!replaced || (replaced.disk === replacement.disk && replaced.path === replacement.path)) {
      return
    }

    await this.#attachments.remove(replaced)
  }
}

export class PersistedAttachmentNotFoundError extends AttachmentError {
  static code = 'E_PERSISTED_ATTACHMENT_NOT_FOUND'
  static status = 404

  constructor(id: string) {
    super(`Persisted attachment "${id}" was not found`)
    this.name = 'PersistedAttachmentNotFoundError'
  }
}
