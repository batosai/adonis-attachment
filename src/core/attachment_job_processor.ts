import type { Attachment } from './attachment.js'
import type { AttachmentJob } from './queue.js'
import type { AttachmentRepository } from './attachment_repository.js'

export type VariantGenerationRequest = {
  attachment: Attachment
  variantKeys?: readonly string[]
}

export interface VariantGenerator {
  generate(request: VariantGenerationRequest): Promise<void>
}

export type AttachmentJobProcessorOptions = {
  attachments: AttachmentRepository
  variants: VariantGenerator
}

export class AttachmentJobProcessor {
  readonly #attachments: AttachmentRepository
  readonly #variants: VariantGenerator

  constructor(options: AttachmentJobProcessorOptions) {
    this.#attachments = options.attachments
    this.#variants = options.variants
  }

  async process(job: AttachmentJob): Promise<void> {
    switch (job.type) {
      case 'generate-variants':
        await this.#generateVariants(job.attachmentId, job.variantKeys)
        return
    }
  }

  async #generateVariants(attachmentId: string, variantKeys?: readonly string[]): Promise<void> {
    const attachment = await this.#attachments.findById(attachmentId)

    if (!attachment) {
      throw new AttachmentNotFoundError(attachmentId)
    }

    await this.#variants.generate({
      attachment,
      ...(variantKeys ? { variantKeys } : {}),
    })
  }
}

export class AttachmentNotFoundError extends Error {
  constructor(attachmentId: string) {
    super(`Attachment "${attachmentId}" was not found`)
    this.name = 'AttachmentNotFoundError'
  }
}
