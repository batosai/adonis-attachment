/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { createWriteStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ConversionWorkspace, createConversionSource } from './conversion_source.js'
import type { Attachment, CreateAttachmentInput } from '../core/attachment.js'
import type { AttachmentService } from '../core/attachment_service.js'
import type { VariantGenerationRequest, VariantGenerator } from '../core/attachment_job_processor.js'
import type { VariantConverter } from './variant_converter.js'
import {
  joinVariantFolders,
  resolveVariantFolder,
  type VariantPathOptions,
} from './variant_path.js'
import type { VariantConverterRegistry } from '../converters/configured_variant_converter_registry.js'
import {
  DynamicBlurhashGenerator,
  isBlurhashEnabled,
  resolveBlurhashComponents,
  type BlurhashGenerator,
} from '../media/blurhash.js'
import { AttachmentConfigurationError, AttachmentError } from '../errors.js'

export type GeneratedVariant = {
  key: string
  attachment: Attachment
}

export type VariantGenerationServiceOptions = {
  attachments: Pick<AttachmentService, 'create' | 'read' | 'remove'> & Partial<Pick<AttachmentService, 'createDraft' | 'getVariantMetadataEnabled' | 'readStream'>>
  converters: readonly VariantConverter[] | VariantConverterRegistry
  blurhash?: BlurhashGenerator
  /** Settings shared by all variants. */
  variant?: VariantPathOptions
}

export class VariantGenerationService implements VariantGenerator {
  readonly #attachments: VariantGenerationServiceOptions['attachments']
  readonly #converters: Map<string, VariantConverter> | undefined
  readonly #registry: VariantConverterRegistry | undefined
  readonly #blurhash: BlurhashGenerator
  readonly #variant: VariantPathOptions | undefined

  constructor(options: VariantGenerationServiceOptions) {
    this.#attachments = options.attachments
    if ('get' in options.converters) {
      this.#registry = options.converters
    } else {
      this.#converters = new Map(options.converters.map((converter) => [converter.key, converter]))
    }
    this.#blurhash = options.blurhash ?? new DynamicBlurhashGenerator()
    const concurrency = options.variant?.concurrency
    if (concurrency !== undefined && typeof concurrency !== 'function') {
      validateConcurrency(concurrency)
    }
    this.#variant = options.variant
  }

  async generate(request: VariantGenerationRequest): Promise<void> {
    await this.generateAll(request)
  }

  async generateAll(request: VariantGenerationRequest): Promise<GeneratedVariant[]> {
    const workspace = new ConversionWorkspace()
    let generated: GeneratedVariant[] | undefined
    try {
      return await workspace.use(async () => {
        generated = await this.#generateAll(request, workspace)
        return generated
      })
    } catch (error) {
      if (generated) await this.#rollback(generated, error)
      throw error
    }
  }

  async #generateAll(request: VariantGenerationRequest, workspace: ConversionWorkspace): Promise<GeneratedVariant[]> {
    let bytes: Promise<Uint8Array> | undefined
    const read = () => (bytes ??= this.#attachments.read(request.attachment))
    const source = createConversionSource(request.attachment.size, request.attachment.extname,
      async () => this.#attachments.readStream
        ? this.#attachments.readStream(request.attachment)
        : Readable.from([await read()]),
      workspace
    )
    const keys = request.variantKeys ?? await this.#keys()
    const meta = this.#attachments.getVariantMetadataEnabled?.(
      undefined, request.meta !== undefined ? { meta: request.meta } : undefined
    ) ?? request.meta

    const limit = this.#variant?.concurrency
    const concurrency = typeof limit === 'function' ? limit(request.attachment) : limit
    if (typeof limit === 'function') validateConcurrency(concurrency)

    const results = await settleVariants(keys, concurrency, async (key) => {
      const converter = await this.#getConverter(key)

      if (!converter) {
        throw new UnknownVariantConverterError(key)
      }

      const attachment = request.attachment
      const output = converter.convertSource
        ? await converter.convertSource({ attachment, input: source, context: workspace })
        : await converter.convert({ attachment, body: await read() })

      if (!output) {
        return undefined
      }
      let content: { body: Uint8Array; file?: never } | { body?: never; file: { path: string; size: number } }
      if ('body' in output) {
        content = { body: output.body }
      } else if (output.data.type === 'buffer') {
        content = { body: output.data.buffer }
      } else {
        let path: string
        if (output.data.type === 'stream') {
          const stream = output.data.stream
          try {
            path = await workspace.createTempFile()
            await pipeline(stream, createWriteStream(path, { flags: 'wx', mode: 0o600 }))
          } finally {
            stream.destroy()
          }
        } else {
          path = output.data.path
        }
        const info = await stat(path)
        if (!info.isFile()) throw new TypeError('Variant output must be a regular file')
        content = { file: { path, size: info.size } }
      }
      const blurhash = output.blurhash ?? (output.mimeType.startsWith('image/')
        ? await this.#generateBlurhash(converter, content)
        : undefined)
      const folder = joinVariantFolders(
        await resolveVariantFolder(this.#variant?.basePath ?? undefined, { attachment: request.attachment }),
        await resolveVariantFolder(output.folder, { attachment: request.attachment })
      )
      const input = {
        ...content,
        originalName: output.fileName,
        mimeType: output.mimeType,
        ...(folder ? { folder } : {}),
        ...(output.metadata ? { metadata: output.metadata } : {}),
        ...(blurhash ? { blurhash } : {}),
        disk: request.attachment.disk,
      }

      return { key, attachment: await this.#persistVariant(input, meta) }
    })

    const generated = results.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : []
    )
    const failure = results.find((result) => result.status === 'rejected')
    if (failure) await this.#rollback(generated, failure.reason)
    return generated
  }

  async #rollback(generated: GeneratedVariant[], failure: unknown): Promise<never> {
    const cleanup = await Promise.allSettled(generated.map((variant) => this.#attachments.remove(variant.attachment)))
    const errors = cleanup.flatMap((result) => result.status === 'rejected' ? [result.reason] : [])
    if (errors.length) {
      throw new AggregateError([failure, ...errors], 'Variant generation and file cleanup failed')
    }
    throw failure
  }

  #keys(): Promise<readonly string[]> {
    return this.#registry?.keys() ?? Promise.resolve([...this.#converters!.keys()])
  }

  #getConverter(key: string): Promise<VariantConverter | undefined> {
    return this.#registry?.get(key) ?? Promise.resolve(this.#converters!.get(key))
  }

  #persistVariant(input: CreateAttachmentInput, meta: boolean | undefined): Promise<Attachment> {
    if (meta !== undefined && this.#attachments.createDraft) {
      return this.#attachments.createDraft(input).persist({ options: { meta } })
    }

    return this.#attachments.create(input)
  }

  async #generateBlurhash(converter: VariantConverter, content: Pick<CreateAttachmentInput, 'body' | 'file'>): Promise<string | undefined> {
    if (!isBlurhashEnabled(converter.blurhash)) {
      return undefined
    }

    try {
      const components = resolveBlurhashComponents(converter.blurhash)
      if (content.file && this.#blurhash.generateFile) {
        return await this.#blurhash.generateFile({ path: content.file.path, ...components })
      }
      return await this.#blurhash.generate({ body: content.body ?? await readFile(content.file!.path), ...components })
    } catch {
      return undefined
    }
  }
}

function validateConcurrency(value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new AttachmentConfigurationError('variant.concurrency must be a positive integer')
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

async function settleVariants<T>(
  keys: readonly string[],
  concurrency: number | undefined,
  generate: (key: string) => Promise<T>
): Promise<PromiseSettledResult<T>[]> {
  if (concurrency === undefined || concurrency >= keys.length) {
    return Promise.allSettled(keys.map(generate))
  }

  const results: PromiseSettledResult<T>[] = []
  let next = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < keys.length) {
      const index = next++
      try {
        results[index] = { status: 'fulfilled', value: await generate(keys[index]!) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }))
  return results
}
