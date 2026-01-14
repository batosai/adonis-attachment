/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidRow } from '@adonisjs/lucid/types/model'
import type { Converter, ConverterOptions } from './converter.js'

import { ConfigProvider } from '@adonisjs/core/types'
import { AttachmentManager } from '../attachment_manager.js'

type ImportConverter = {
  default: unknown
}

export interface ConverterConfig extends ConverterOptions {
  converter?: () => Promise<ImportConverter>
  options?: ConverterOptions
}

export interface Queue {
  concurrency: number
}

export type BinPaths = {
  ffmpegPath?: string
  ffprobePath?: string
  pdftoppmPath?: string
  pdfinfoPath?: string
  sofficePath?: string
}

export type AttachmentConfig<KnownConverter extends Record<string, ConverterConfig>> = {
  bin?: BinPaths
  meta?: boolean
  rename?:
    | boolean
    | ((record: LucidRow, column?: string, currentName?: string) => string)
    | ((record: LucidRow, column?: string, currentName?: string) => Promise<string>)
  preComputeUrl?: boolean
  timeout?: number
  converters?: {
    [K in keyof KnownConverter]: KnownConverter[K]
  }
  queue?: Queue
  variant?: {
    basePath?: string
    ignoreFolder?: boolean
  }
}

export interface AttachmentVariants {}

export type InferConverters<
  Config extends ConfigProvider<{
    bin?: unknown
    meta?: unknown
    rename?: unknown
    preComputeUrl?: unknown
    timeout?: unknown
    converters?: unknown
    queue?: unknown
    variant?: unknown
  }>,
> = Exclude<Awaited<ReturnType<Config['resolver']>>['converters'], undefined>

export interface AttachmentService extends AttachmentManager<
  AttachmentVariants extends Record<string, Converter> ? AttachmentVariants : never
> {}
