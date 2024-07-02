/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { BaseConverter, ConverterOptions } from "./converter.js"

type ImportConverter = {
  default: unknown
}

type Converter = {
  key: string
  converter: () => Promise<ImportConverter>
  options?: ConverterOptions
}

export type AttachmentConfig = {
  basePath: string
  converters?: Converter[]
}

export type ResolvedConverter = {
  key: string
  converter: BaseConverter
}

export type ResolvedAttachmentConfig = {
  basePath: string
  converters?: ResolvedConverter[]
}