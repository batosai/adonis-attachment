/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentMetadata, MediaMetadataExtractor } from './media_metadata.js'
import { MissingOptionalDependencyError } from '../errors.js'
import { loadOptionalDependency } from '../utils/optional_dependency.js'
import type { VariantConverter, VariantConversionInput } from '../variants/variant_converter.js'
import {
  normalizeSharpFormat,
  type SharpFormat,
  type SharpFormatOptions,
  type SharpOutputFormat,
  type SharpResizeOptions,
} from '../converters/converter.js'

export type { SharpFormat, SharpFormatOptions, SharpOutputFormat, SharpResizeOptions } from '../converters/converter.js'

export type SharpMetadata = {
  width?: number | undefined
  height?: number | undefined
  format?: string | undefined
  size?: number | undefined
  density?: number | undefined
  hasAlpha?: boolean | undefined
  pages?: number | undefined
  pageHeight?: number | undefined
  orientation?: number | undefined
}

export interface SharpImage {
  metadata(): Promise<SharpMetadata>
  autoOrient?(): SharpImage
  resize(width?: number, height?: number, options?: SharpResizeOptions): SharpImage
  toFormat(format: string, options?: SharpFormatOptions): SharpImage
  toBuffer(): Promise<Uint8Array>
}

export type SharpFactory = (input: Uint8Array) => SharpImage
export type SharpMetadataFactory = (input: Buffer) => Pick<SharpImage, 'metadata'>

const sharpMetadataMimeTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
  'image/svg+xml', 'image/tiff', 'image/heif', 'image/heic',
])

export type SharpVariantOptions = {
  key: string
  sharp: SharpFactory
  width?: number
  height?: number
  resize?: SharpResizeOptions
  format?: SharpFormat
  autoOrient?: boolean
  folder?: string
  transform?: (image: SharpImage, input: VariantConversionInput) => SharpImage | Promise<SharpImage>
}

/** Loads Sharp lazily unless the caller supplies a metadata factory. */
export function createSharpMetadataExtractor(sharp?: SharpMetadataFactory): MediaMetadataExtractor {
  let factory: Promise<SharpMetadataFactory> | undefined
  return {
    supports({ attachment }) {
      return sharpMetadataMimeTypes.has(attachment.mimeType)
    },
    async extract({ body }) {
      factory ??= sharp ? Promise.resolve(sharp) : loadMetadataFactory()
      return compactMetadata(await (await factory)(Buffer.from(body)).metadata())
    },
  }
}

async function loadMetadataFactory(): Promise<SharpMetadataFactory> {
  const module = await loadOptionalDependency<{ default?: unknown }>('sharp')
  if (typeof module.default !== 'function') {
    throw new MissingOptionalDependencyError('sharp')
  }
  return module.default as SharpMetadataFactory
}

/** Creates a Sharp-backed converter for one configured image variant. */
export function createSharpVariantConverter(options: SharpVariantOptions): VariantConverter {
  return {
    key: options.key,
    async convert(input) {
      let image = options.sharp(input.body)
      if (options.autoOrient && image.autoOrient) {
        image = image.autoOrient()
      }

      if (options.transform) {
        image = await options.transform(image, input)
      } else if (options.width !== undefined || options.height !== undefined) {
        image = image.resize(options.width, options.height, options.resize)
      }

      const outputFormat = options.format ? normalizeSharpFormat(options.format) : undefined
      if (outputFormat) {
        image = image.toFormat(outputFormat.format, outputFormat.options)
      }

      const format = outputFormat?.format ?? input.attachment.extname
      const extension = format || 'bin'

      return {
        body: await image.toBuffer(),
        fileName: `${options.key}.${extension}`,
        mimeType: mimeTypeForFormat(format) ?? input.attachment.mimeType,
        ...(options.folder ? { folder: options.folder } : {}),
      }
    },
  }
}

function compactMetadata(metadata: SharpMetadata): AttachmentMetadata | undefined {
  const compact: AttachmentMetadata = {
    ...(metadata.width !== undefined && metadata.height !== undefined
      ? { dimension: { width: metadata.width, height: metadata.height } }
      : {}),
    ...(metadata.format !== undefined ? { format: metadata.format } : {}),
    ...(metadata.density !== undefined ? { density: metadata.density } : {}),
    ...(metadata.hasAlpha !== undefined ? { hasAlpha: metadata.hasAlpha } : {}),
    ...(metadata.pages !== undefined ? { pages: metadata.pages } : {}),
    ...(metadata.pageHeight !== undefined ? { pageHeight: metadata.pageHeight } : {}),
    ...(metadata.orientation !== undefined ? { orientation: { value: metadata.orientation } } : {}),
  }

  return Object.keys(compact).length > 0 ? compact : undefined
}

function mimeTypeForFormat(format: string): string | undefined {
  switch (format) {
    case 'avif': return 'image/avif'
    case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'heif': return 'image/heif'
    case 'png': return 'image/png'
    case 'raw': return 'application/octet-stream'
    case 'tiff': return 'image/tiff'
    case 'webp': return 'image/webp'
    default: return undefined
  }
}
