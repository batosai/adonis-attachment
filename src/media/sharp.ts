/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { MediaMetadataExtractor } from './media_metadata.js'
import type { VariantConverter, VariantConversionInput } from '../variants/variant_converter.js'

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

export type SharpResizeOptions = {
  fit?: string
  position?: string
  withoutEnlargement?: boolean
}

export interface SharpImage {
  metadata(): Promise<SharpMetadata>
  resize(width?: number, height?: number, options?: SharpResizeOptions): SharpImage
  toFormat(format: string): SharpImage
  toBuffer(): Promise<Uint8Array>
}

export type SharpFactory = (input: Uint8Array) => SharpImage

export type SharpVariantOptions = {
  key: string
  sharp: SharpFactory
  width?: number
  height?: number
  resize?: SharpResizeOptions
  format?: 'avif' | 'jpeg' | 'png' | 'webp'
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

      if (options.transform) {
        image = await options.transform(image, input)
      } else if (options.width !== undefined || options.height !== undefined) {
        image = image.resize(options.width, options.height, options.resize)
      }

      if (options.format) {
        image = image.toFormat(options.format)
      }

      const format = options.format ?? input.attachment.extname
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

function compactMetadata(metadata: SharpMetadata): Record<string, unknown> | undefined {
  const compact = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  )

  return Object.keys(compact).length > 0 ? compact : undefined
}

function mimeTypeForFormat(format: string): string | undefined {
  switch (format) {
    case 'avif': return 'image/avif'
    case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
    default: return undefined
  }
}
