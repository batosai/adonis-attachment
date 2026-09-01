/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { createPdfInfoMetadataExtractor, createFfprobeMetadataExtractor, type FfprobeMetadataExtractorOptions, type PdfInfoMetadataExtractorOptions } from './binaries.js'
import { createExifMetadataExtractor, type ExifMetadataExtractorOptions } from './exif.js'
import type { MediaMetadataExtractor } from './media_metadata.js'
import type { AttachmentBinariesConfig } from './binary_config.js'

export type DefaultMetadataExtractorOptions = {
  exif?: false | ExifMetadataExtractorOptions
  ffprobe?: false | FfprobeMetadataExtractorOptions
  pdfinfo?: false | PdfInfoMetadataExtractorOptions
  binaries?: AttachmentBinariesConfig
}

/**
 * Creates the default metadata profile: EXIF for images, ffprobe for media, and
 * pdfinfo for PDFs. Each extractor can be disabled or pointed at a custom binary.
 */
export function createDefaultMetadataExtractors(
  options: DefaultMetadataExtractorOptions = {}
): readonly MediaMetadataExtractor[] {
  return [
    ...(options.exif === false ? [] : [createExifMetadataExtractor(options.exif)]),
    ...(options.ffprobe === false
      ? []
      : [createFfprobeMetadataExtractor({
          ...(options.binaries?.ffprobe?.command ? { command: options.binaries.ffprobe.command } : {}),
          ...(options.binaries?.ffprobe?.timeout !== undefined ? { timeout: options.binaries.ffprobe.timeout } : {}),
          ...(options.ffprobe ?? {}),
        })]),
    ...(options.pdfinfo === false
      ? []
      : [createPdfInfoMetadataExtractor({
          ...(options.binaries?.pdfinfo?.command ? { command: options.binaries.pdfinfo.command } : {}),
          ...(options.binaries?.pdfinfo?.timeout !== undefined ? { timeout: options.binaries.pdfinfo.timeout } : {}),
          ...(options.pdfinfo ?? {}),
        })]),
  ]
}
