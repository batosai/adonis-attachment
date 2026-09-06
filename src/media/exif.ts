/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentMetadata, MediaMetadataExtractor } from './media_metadata.js'
import { MissingOptionalDependencyError } from '../errors.js'
import { loadOptionalDependency } from '../utils/optional_dependency.js'

export type ExifReaderTag = {
  value?: unknown
  description?: string
}

export type ExifReaderTags = {
  exif?: Record<string, ExifReaderTag | undefined>
  png?: Record<string, ExifReaderTag | undefined>
  pngFile?: Record<string, ExifReaderTag | undefined>
  file?: Record<string, ExifReaderTag | undefined>
  icc?: Record<string, ExifReaderTag | undefined>
  gps?: Record<string, number | ExifReaderTag | undefined>
  [group: string]: unknown
}

const exifMimeTypes = new Set([
  'image/jpeg', 'image/jxl', 'image/tiff', 'image/png', 'image/heic',
  'image/heif', 'image/avif', 'image/webp', 'image/gif',
])

export interface ExifReader {
  load(input: Buffer, options: { expanded: true }): ExifReaderTags | Promise<ExifReaderTags>
}

export type ExifMetadataExtractorOptions = {
  reader?: ExifReader | (() => Promise<ExifReader>)
}

/** Extracts the v5 EXIF, PNG, ICC, and GPS metadata shape for image attachments. */
export function createExifMetadataExtractor(
  options: ExifMetadataExtractorOptions = {}
): MediaMetadataExtractor {
  let reader: Promise<ExifReader> | undefined

  return {
    supports({ attachment }) {
      return exifMimeTypes.has(attachment.mimeType)
    },
    async extract({ body }) {
      reader ??= resolveReader(options.reader)
      return normalizeMetadata(await (await reader).load(Buffer.from(body), { expanded: true }))
    },
  }
}

async function resolveReader(source: ExifMetadataExtractorOptions['reader']): Promise<ExifReader> {
  if (typeof source === 'function') {
    return source()
  }
  if (source) {
    return source
  }

  const module = await loadOptionalDependency<{ default?: unknown }>('exifreader')
  const reader = module.default ?? module

  if (!isExifReader(reader)) {
    throw new MissingOptionalDependencyError('exifreader')
  }

  return reader
}

function isExifReader(value: unknown): value is ExifReader {
  return !!value && typeof value === 'object' && 'load' in value && typeof value.load === 'function'
}

function normalizeMetadata(tags: ExifReaderTags): AttachmentMetadata | undefined {
  const exif = tags.exif
  const png = tags.png
  const pngFile = tags.pngFile
  const file = tags.file
  const icc = tags.icc
  const width = numberTag(exif?.PixelXDimension)
    ?? numberTag(png?.['Image Width'])
    ?? numberTag(pngFile?.['Image Width'])
    ?? numberTag(file?.['Image Width'])
    ?? numberTag(icc?.['Image Width'])
  const height = numberTag(exif?.PixelYDimension)
    ?? numberTag(png?.['Image Height'])
    ?? numberTag(pngFile?.['Image Height'])
    ?? numberTag(file?.['Image Height'])
    ?? numberTag(icc?.['Image Height'])
  const orientation = numberTag(exif?.Orientation)
  const date = stringTag(exif?.DateTime) ?? stringTag(png?.['Creation Time']) ?? stringTag(icc?.['Creation Time'])
  const host = stringTag(exif?.Software) ?? stringTag(png?.Software) ?? stringTag(icc?.Software)
  const metadata: AttachmentMetadata = {
    ...(date ? { date } : {}),
    ...(host ? { host } : {}),
    ...(width !== undefined && height !== undefined ? { dimension: { width, height } } : {}),
    ...(orientation !== undefined
      ? {
          orientation: {
            value: orientation,
            ...(exif?.Orientation?.description ? { description: exif.Orientation.description } : {}),
          },
        }
      : {}),
    ...gpsMetadata(tags.gps),
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function gpsMetadata(tags: ExifReaderTags['gps']): Partial<AttachmentMetadata> {
  const latitude = numberTag(tags?.Latitude)
  const longitude = numberTag(tags?.Longitude)
  const altitude = numberTag(tags?.Altitude)

  if (latitude === undefined && longitude === undefined && altitude === undefined) {
    return {}
  }

  return {
    gps: {
      ...(latitude !== undefined ? { latitude } : {}),
      ...(longitude !== undefined ? { longitude } : {}),
      ...(altitude !== undefined ? { altitude } : {}),
    },
  }
}

function numberTag(tag: ExifReaderTag | number | undefined): number | undefined {
  const value = typeof tag === 'number' ? tag : tag?.value
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN

  return Number.isFinite(number) ? number : undefined
}

function stringTag(tag: ExifReaderTag | undefined): string | undefined {
  const value = tag?.description ?? tag?.value
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
