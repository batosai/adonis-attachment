/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { createPdfInfoMetadataExtractor, createFfprobeMetadataExtractor, type FfprobeMetadataExtractorOptions, type PdfInfoMetadataExtractorOptions } from './binaries.js'
import { createExifMetadataExtractor, type ExifMetadataExtractorOptions } from './exif.js'
import type { MediaMetadataExtractor } from './media_metadata.js'

export type V5CompatibleMetadataExtractorOptions = {
  exif?: false | ExifMetadataExtractorOptions
  ffprobe?: false | FfprobeMetadataExtractorOptions
  pdfinfo?: false | PdfInfoMetadataExtractorOptions
}

/**
 * Creates the v5 metadata profile: EXIF for images, ffprobe for media, and
 * pdfinfo for PDFs. Each extractor can be disabled or pointed at a custom binary.
 */
export function createV5CompatibleMetadataExtractors(
  options: V5CompatibleMetadataExtractorOptions = {}
): readonly MediaMetadataExtractor[] {
  return [
    ...(options.exif === false ? [] : [createExifMetadataExtractor(options.exif)]),
    ...(options.ffprobe === false ? [] : [createFfprobeMetadataExtractor(options.ffprobe)]),
    ...(options.pdfinfo === false ? [] : [createPdfInfoMetadataExtractor(options.pdfinfo)]),
  ]
}
