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

export type BinPaths = {
  ffmpegPath?: string
  ffprobePath?: string
  pdftocairoBasePath?: string
  libreofficePaths?: Array<string>
}

export type AttachmentConfig = {
  bin?: BinPaths
  meta?: boolean
  rename?: boolean
  preComputeUrl?: boolean
  converters?: ConverterConfig[]
}

export type ResolvedConverter = {
  key: string
  converter: Converter
}

export type ResolvedAttachmentConfig = {
  bin?: BinPaths
  meta?: boolean
  rename?: boolean
  preComputeUrl?: boolean
  converters?: ResolvedConverter[]
}
