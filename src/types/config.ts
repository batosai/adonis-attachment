/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Converter, ConverterOptions } from './converter.js'

type ImportConverter = {
  default: unknown
}

type ConverterConfig = {
  key: string
  converter: () => Promise<ImportConverter>
  options?: ConverterOptions
}

export type AttachmentConfig = {
  converters?: ConverterConfig[]
}

export type ResolvedConverter = {
  key: string
  converter: Converter
}

export type ResolvedAttachmentConfig = {
  converters?: ResolvedConverter[]
}
