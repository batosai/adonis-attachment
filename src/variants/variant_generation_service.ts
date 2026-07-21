/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment, CreateAttachmentInput } from '../core/attachment.js'
import type { AttachmentService } from '../core/attachment_service.js'
import type { VariantGenerationRequest, VariantGenerator } from '../core/attachment_job_processor.js'
import type { VariantConverter } from './variant_converter.js'
import type { VariantConverterRegistry } from '../converters/configured_variant_converter_registry.js'

export type GeneratedVariant = {
  key: string
  attachment: Attachment
}

export type VariantGenerationServiceOptions = {
  attachments: Pick<AttachmentService, 'create' | 'read'> & Partial<Pick<AttachmentService, 'createDraft'>>
  converters: readonly VariantConverter[] | VariantConverterRegistry
}

export class VariantGenerationService implements VariantGenerator {
  readonly #attachments: Pick<AttachmentService, 'create' | 'read'> & Partial<Pick<AttachmentService, 'createDraft'>>
  readonly #converters: Map<string, VariantConverter> | undefined
  readonly #registry: VariantConverterRegistry | undefined

  constructor(options: VariantGenerationServiceOptions) {
    this.#attachments = options.attachments
    if ('get' in options.converters) {
      this.#registry = options.converters
    } else {
      this.#converters = new Map(options.converters.map((converter) => [converter.key, converter]))
    }
  }

  async generate(request: VariantGenerationRequest): Promise<void> {
    await this.generateAll(request)
  }

  async generateAll(request: VariantGenerationRequest): Promise<GeneratedVariant[]> {
    const source = await this.#attachments.read(request.attachment)
    const keys = request.variantKeys ?? await this.#keys()

    const generated = await Promise.all(
      keys.map(async (key) => {
        const converter = await this.#getConverter(key)

        if (!converter) {
          throw new UnknownVariantConverterError(key)
        }

        const output = await converter.convert({ attachment: request.attachment, body: source })

        if (!output) {
          return undefined
        }
        const input: CreateAttachmentInput = {
          body: output.body,
          originalName: output.fileName,
          mimeType: output.mimeType,
          ...(output.folder ? { folder: output.folder } : {}),
          ...(output.metadata ? { metadata: output.metadata } : {}),
          disk: request.attachment.disk,
        }

        return { key, attachment: await this.#persistVariant(input, request.meta) }
      })
    )

    return generated.filter((variant): variant is GeneratedVariant => variant !== undefined)
  }

  #keys(): Promise<readonly string[]> {
    return this.#registry?.keys() ?? Promise.resolve([...this.#converters!.keys()])
  }

  #getConverter(key: string): Promise<VariantConverter | undefined> {
    return this.#registry?.get(key) ?? Promise.resolve(this.#converters!.get(key))
  }

  #persistVariant(input: CreateAttachmentInput, meta: boolean | undefined): Promise<Attachment> {
    if (meta && this.#attachments.createDraft) {
      return this.#attachments.createDraft(input).persist({ options: { meta: true } })
    }

    return this.#attachments.create(input)
  }
}

export class UnknownVariantConverterError extends Error {
  constructor(key: string) {
    super(`No variant converter is registered for "${key}"`)
    this.name = 'UnknownVariantConverterError'
  }
}
