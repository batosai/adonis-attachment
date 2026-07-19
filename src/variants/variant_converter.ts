/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../core/attachment.js'

export type VariantConversionInput = {
  attachment: Attachment
  body: Uint8Array
}

export type VariantConversionOutput = {
  body: Uint8Array
  fileName: string
  mimeType: string
  folder?: string
  metadata?: Record<string, unknown>
}

export interface VariantConverter {
  key: string
  convert(input: VariantConversionInput): Promise<VariantConversionOutput>
}
