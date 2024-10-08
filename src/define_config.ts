/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type {
  AttachmentConfig,
  ResolvedAttachmentConfig,
  ResolvedConverter,
} from './types/config.js'

import { ConfigProvider } from '@adonisjs/core/types'
import { configProvider } from '@adonisjs/core'
import BaseConverter from './converters/converter.js'

// export function defineConfig<T extends AttachmentConfig>(config: T): T {
export function defineConfig(config: AttachmentConfig): ConfigProvider<ResolvedAttachmentConfig> {
  return configProvider.create(async (_app) => {
    let convertersMap: ResolvedConverter[] = []
    if (config.converters) {
      convertersMap = await Promise.all(
        config.converters.map(async (c) => {
          const binConfig = config.bin
          const { default: value } = await c.converter()
          const Converter = value as typeof BaseConverter

          return {
            key: c.key,
            converter: new Converter(c.options, binConfig),
          }
        })
      )
    }

    return {
      ...config,
      converters: convertersMap,
    }
  })
}
