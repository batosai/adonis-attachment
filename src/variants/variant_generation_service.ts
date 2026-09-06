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
import {
  DynamicBlurhashGenerator,
  isBlurhashEnabled,
  resolveBlurhashComponents,
  type BlurhashGenerator,
} from '../media/blurhash.js'
import { AttachmentError } from '../errors.js'

export type GeneratedVariant = {
  key: string
  attachment: Attachment
}

export type VariantGenerationServiceOptions = {
  attachments: Pick<AttachmentService, 'create' | 'read' | 'remove'> & Partial<Pick<AttachmentService, 'createDraft'>>
  converters: readonly VariantConverter[] | VariantConverterRegistry
  blurhash?: BlurhashGenerator
}

export class VariantGenerationService implements VariantGenerator {
  readonly #attachments: VariantGenerationServiceOptions['attachments']
  readonly #converters: Map<string, VariantConverter> | undefined
  readonly #registry: VariantConverterRegistry | undefined
  readonly #blurhash: BlurhashGenerator

  constructor(options: VariantGenerationServiceOptions) {
    this.#attachments = options.attachments
    if ('get' in options.converters) {
      this.#registry = options.converters
    } else {
      this.#converters = new Map(options.converters.map((converter) => [converter.key, converter]))
    }
    this.#blurhash = options.blurhash ?? new DynamicBlurhashGenerator()
  }

  async generate(request: VariantGenerationRequest): Promise<void> {
    await this.generateAll(request)
  }

  async generateAll(request: VariantGenerationRequest): Promise<GeneratedVariant[]> {
    const source = await this.#attachments.read(request.attachment)
    const keys = request.variantKeys ?? await this.#keys()

    const results = await Promise.allSettled(
      keys.map(async (key) => {
        const converter = await this.#getConverter(key)

        if (!converter) {
          throw new UnknownVariantConverterError(key)
        }

        const output = await converter.convert({ attachment: request.attachment, body: source })

        if (!output) {
          return undefined
        }
        const blurhash = output.blurhash ?? await this.#generateBlurhash(converter, output.body)
        const input: CreateAttachmentInput = {
          body: output.body,
          originalName: output.fileName,
          mimeType: output.mimeType,
          ...(output.folder ? { folder: output.folder } : {}),
          ...(output.metadata ? { metadata: output.metadata } : {}),
          ...(blurhash ? { blurhash } : {}),
          disk: request.attachment.disk,
        }

        return { key, attachment: await this.#persistVariant(input, request.meta) }
      })
    )

    const generated = results.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : []
    )
    const failure = results.find((result) => result.status === 'rejected')
    if (failure) {
      const cleanup = await Promise.allSettled(generated.map((variant) => this.#attachments.remove(variant.attachment)))
      const errors = cleanup.flatMap((result) => result.status === 'rejected' ? [result.reason] : [])
      if (errors.length) {
        throw new AggregateError([failure.reason, ...errors], 'Variant generation and file cleanup failed')
      }
      throw failure.reason
    }
    return generated
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

  async #generateBlurhash(converter: VariantConverter, body: Uint8Array): Promise<string | undefined> {
    if (!isBlurhashEnabled(converter.blurhash)) {
      return undefined
    }

    try {
      return await this.#blurhash.generate({ body, ...resolveBlurhashComponents(converter.blurhash) })
    } catch {
      return undefined
    }
  }
}

export class UnknownVariantConverterError extends AttachmentError {
  static code = 'E_UNKNOWN_VARIANT_CONVERTER'
  static status = 422

  constructor(key: string) {
    super(`No variant converter is registered for "${key}"`)
    this.name = 'UnknownVariantConverterError'
  }
}
