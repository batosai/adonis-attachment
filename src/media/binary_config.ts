/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

/** Location and optional execution limit for one external media binary. */
export type AttachmentBinaryConfig = {
  command?: string
  timeout?: number
}

/** Shared binary declarations for autodetected converters and metadata extractors. */
export type AttachmentBinariesConfig = {
  ffmpeg?: AttachmentBinaryConfig
  ffprobe?: AttachmentBinaryConfig
  pdftoppm?: AttachmentBinaryConfig
  pdfinfo?: AttachmentBinaryConfig
  soffice?: AttachmentBinaryConfig
}
