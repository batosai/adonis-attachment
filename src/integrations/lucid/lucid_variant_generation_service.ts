/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentService } from '../../core/attachment_service.js'
import type { VariantGenerationRequest, VariantGenerator } from '../../core/attachment_job_processor.js'
import type { GeneratedVariant, VariantGenerationService } from '../../variants/variant_generation_service.js'
import { AttachmentModel } from './attachment_model.js'
import { LucidAttachmentStore } from './lucid_attachment_store.js'

export type LucidVariantGenerationServiceOptions = {
  generator: Pick<VariantGenerationService, 'generateAll'>
  attachments: Pick<AttachmentService, 'remove'>
  store: Pick<LucidAttachmentStore, 'findById' | 'createVariant'>
}

export class LucidVariantGenerationService implements VariantGenerator {
  readonly #generator: Pick<VariantGenerationService, 'generateAll'>
  readonly #attachments: Pick<AttachmentService, 'remove'>
  readonly #store: Pick<LucidAttachmentStore, 'findById' | 'createVariant'>

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
      await this.#persist(original, variant)
    }
  }

  async #persist(original: AttachmentModel, variant: GeneratedVariant): Promise<void> {
    try {
      await this.#store.createVariant(original, variant.key, variant.attachment)
    } catch (error) {
      await this.#attachments.remove(variant.attachment)
      throw error
    }
  }
}

export class PersistedAttachmentNotFoundError extends Error {
  constructor(id: string) {
    super(`Persisted attachment "${id}" was not found`)
    this.name = 'PersistedAttachmentNotFoundError'
  }
}
