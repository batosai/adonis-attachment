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
  timeout?: number
  converters?: { [K in keyof KnownConverters]: KnownConverters[K] }
  queue?: Queue
}

export function defineConfig<KnownConverter extends Record<string, ConverterConfig>>(
  config: AttachmentConfig<KnownConverter>
): ConfigProvider<ResolvedAttachmentConfig<KnownConverter>> {
  return configProvider.create(async (_app) => {
    const convertersList = Object.keys(config.converters || {})
    const converters: Record<string, BaseConverter> = {}

    if (config.converters) {
      for (let converterName of convertersList) {
        const converter = config.converters[converterName]
        const binConfig = config.bin

        if (converter.converter === undefined) {
          converter.converter = () => import('@jrmc/adonis-attachment/converters/autodetect_converter')
        }

        try {
          const { default: value } = await converter.converter()
          const Converter = value as typeof BaseConverter

          converters[converterName] = new Converter(converter.options, binConfig)
        } catch (error) {
          console.error(`Failed to load converter ${converterName}:`, error)
        }
      }
    }

    return {
      ...config,
      converters,
    } as ResolvedAttachmentConfig<KnownConverter>
  })
}
