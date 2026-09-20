/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../core/attachment.js'
import type { BlurhashOptions } from '../media/blurhash.js'
import type { VariantFolder } from './variant_path.js'

export type VariantConversionInput = {
  attachment: Attachment
  body: Uint8Array
}

export type VariantConversionOutput = {
  body: Uint8Array
  fileName: string
  mimeType: string
  folder?: VariantFolder
  metadata?: Record<string, unknown>
  blurhash?: string
}

export interface VariantConverter {
  key: string
  blurhash?: BlurhashOptions
  convert(input: VariantConversionInput): Promise<VariantConversionOutput | undefined>
}
