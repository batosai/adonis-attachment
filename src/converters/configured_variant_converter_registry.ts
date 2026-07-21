/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import Converter, { type ConverterOptions } from './converter.js'
import type { VariantConverter } from '../variants/variant_converter.js'

export type ConverterConstructor = new (options?: ConverterOptions) => Converter
export type ConverterModule = {
  default: ConverterConstructor | Converter | VariantConverter
}
export type ConverterConfig = ConverterOptions & {
  converter: () => Promise<ConverterModule>
  /** Optional nested options are merged after the direct v5-style options. */
  options?: ConverterOptions
}
export type ConverterConfigMap = Record<string, ConverterConfig>

export interface VariantConverterRegistry {
  keys(): Promise<readonly string[]>
  get(key: string): Promise<VariantConverter | undefined>
}

/** Lazily imports and instantiates the converters declared in package configuration. */
export class ConfiguredVariantConverterRegistry implements VariantConverterRegistry {
  readonly #config: ConverterConfigMap
  readonly #converters = new Map<string, Promise<VariantConverter>>()

  constructor(config: ConverterConfigMap) {
    this.#config = config
  }

  async keys(): Promise<readonly string[]> {
    return Object.keys(this.#config)
  }

  get(key: string): Promise<VariantConverter | undefined> {
    const config = this.#config[key]

    if (!config) {
      return Promise.resolve(undefined)
    }

    let converter = this.#converters.get(key)
    if (!converter) {
      converter = this.#load(key, config)
      this.#converters.set(key, converter)
    }

    return converter
  }

  async #load(key: string, config: ConverterConfig): Promise<VariantConverter> {
    const module = await config.converter()
    const implementation = module.default

    if (isVariantConverter(implementation)) {
      return { key, convert: implementation.convert.bind(implementation) }
    }

    const converter = typeof implementation === 'function'
      ? new implementation(resolveOptions(config))
      : implementation

    if (!(converter instanceof Converter)) {
      throw new InvalidConverterModuleError(key)
    }

    return {
      key,
      convert(input) {
        return converter.handle({ ...input, options: converter.options })
      },
    }
  }
}

export class InvalidConverterModuleError extends Error {
  constructor(key: string) {
    super(`Converter "${key}" must default-export a Converter class or a VariantConverter object`)
    this.name = 'InvalidConverterModuleError'
  }
}

function isVariantConverter(value: unknown): value is VariantConverter {
  return !!value && typeof value === 'object' && 'convert' in value && typeof value.convert === 'function'
}

function resolveOptions(config: ConverterConfig): ConverterOptions {
  const { converter: _converter, options, ...direct } = config

  return { ...direct, ...options }
}
