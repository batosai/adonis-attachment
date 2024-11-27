/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentConfig, BinPaths, ConverterConfig, Queue } from './types/config.js'

import { ConfigProvider } from '@adonisjs/core/types'
import { configProvider } from '@adonisjs/core'
import BaseConverter from './converters/converter.js'
import { Converter } from './types/converter.js'

/**
 * Config resolved by the "defineConfig" method
 */
export type ResolvedAttachmentConfig<KnownConverters extends Record<string, Converter>> = {
  bin?: BinPaths
  meta?: boolean
  rename?: boolean
  preComputeUrl?: boolean
  converters?: {
    [K in keyof KnownConverters]: KnownConverters[K]
  }
  queue?: Queue
}

// export function defineConfig<T extends AttachmentConfig>(config: T): T {
export function defineConfig<KnownConverter extends Record<string, ConverterConfig>>(
  config: AttachmentConfig<KnownConverter>
): ConfigProvider<ResolvedAttachmentConfig<KnownConverter>> {
  return configProvider.create(async (_app) => {
    const convertersList = Object.keys(config.converters || {})
    const converters = {} as Record<string, BaseConverter>

    if (config.converters) {
      for (let converterName of convertersList) {
        const converter = config.converters[converterName]
        const binConfig = config.bin
        const { default: value } = await converter.converter()
        const Converter = value as typeof BaseConverter

        converters[converterName] = new Converter(converter.options, binConfig)
      }
    }

    return {
      ...config,
      converters,
    } as ResolvedAttachmentConfig<KnownConverter>
  })
}
