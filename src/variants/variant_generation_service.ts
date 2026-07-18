import type { Attachment, CreateAttachmentInput } from '../core/attachment.js'
import type { AttachmentService } from '../core/attachment_service.js'
import type { VariantGenerationRequest, VariantGenerator } from '../core/attachment_job_processor.js'
import type { VariantConverter } from './variant_converter.js'

export type GeneratedVariant = {
  key: string
  attachment: Attachment
}

export type VariantGenerationServiceOptions = {
  attachments: Pick<AttachmentService, 'create' | 'read'>
  converters: readonly VariantConverter[]
}

export class VariantGenerationService implements VariantGenerator {
  readonly #attachments: Pick<AttachmentService, 'create' | 'read'>
  readonly #converters: Map<string, VariantConverter>

  constructor(options: VariantGenerationServiceOptions) {
    this.#attachments = options.attachments
    this.#converters = new Map(options.converters.map((converter) => [converter.key, converter]))
  }

  async generate(request: VariantGenerationRequest): Promise<void> {
    await this.generateAll(request)
  }

  async generateAll(request: VariantGenerationRequest): Promise<GeneratedVariant[]> {
    const source = await this.#attachments.read(request.attachment)
    const keys = request.variantKeys ?? [...this.#converters.keys()]

    return Promise.all(
      keys.map(async (key) => {
        const converter = this.#converters.get(key)

        if (!converter) {
          throw new UnknownVariantConverterError(key)
        }

        const output = await converter.convert({ attachment: request.attachment, body: source })
        const input: CreateAttachmentInput = {
          body: output.body,
          originalName: output.fileName,
          mimeType: output.mimeType,
          ...(output.folder ? { folder: output.folder } : {}),
          ...(output.metadata ? { metadata: output.metadata } : {}),
          disk: request.attachment.disk,
        }

        return { key, attachment: await this.#attachments.create(input) }
      })
    )
  }
}

export class UnknownVariantConverterError extends Error {
  constructor(key: string) {
    super(`No variant converter is registered for "${key}"`)
    this.name = 'UnknownVariantConverterError'
  }
}
