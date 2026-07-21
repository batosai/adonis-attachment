/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentMetadata, MediaMetadataExtractor } from './media_metadata.js'
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
  width?: number
  height?: number
  format?: string
  size?: number
  density?: number
  hasAlpha?: boolean
  pages?: number
  pageHeight?: number
  orientation?: number
}

export interface SharpImage {
  metadata(): Promise<SharpMetadata>
  autoOrient?(): SharpImage
  resize(width?: number, height?: number, options?: SharpResizeOptions): SharpImage
  toFormat(format: string, options?: SharpFormatOptions): SharpImage
  toBuffer(): Promise<Uint8Array>
}

export type SharpFactory = (input: Uint8Array) => SharpImage

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

/** Creates an image-only metadata extractor backed by a caller-provided Sharp factory. */
export function createSharpMetadataExtractor(sharp: SharpFactory): MediaMetadataExtractor {
  return {
    supports({ attachment }) {
      return attachment.mimeType.startsWith('image/')
    },
    async extract({ body }) {
      return compactMetadata(await sharp(body).metadata())
    },
  }
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
