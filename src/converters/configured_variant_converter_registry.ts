/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import Converter, { type ConverterOptions } from './converter.js'
import AutodetectConverter from './autodetect_converter.js'
import type { VariantConverter } from '../variants/variant_converter.js'

export type ConverterConstructor = new (options?: any) => Converter<any>
export type ConverterModule = {
  default: ConverterConstructor | Converter | VariantConverter
}
export type ConverterConfig<Options extends ConverterOptions = ConverterOptions> = Options & {
  /** Defaults to AutodetectConverter when omitted. */
  converter?: () => Promise<ConverterModule>
  /** Optional nested options are merged after the direct v5-style options. */
  options?: Partial<Options>
}
export type ConverterConfigMap = Record<string, ConverterConfig>

export interface VariantConverterRegistry<Key extends string = string> {
  keys(): Promise<readonly Key[]>
  get(key: string): Promise<VariantConverter | undefined>
}

/** Lazily imports and instantiates the converters declared in package configuration. */
export class ConfiguredVariantConverterRegistry<
  Config extends ConverterConfigMap = ConverterConfigMap,
> implements VariantConverterRegistry<Extract<keyof Config, string>> {
  readonly #config: Config
  readonly #converters = new Map<string, Promise<VariantConverter>>()

  constructor(config: Config) {
    this.#config = config
  }

  async keys(): Promise<readonly Extract<keyof Config, string>[]> {
    return Object.keys(this.#config) as Extract<keyof Config, string>[]
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
    if (!config.converter) {
      return asVariantConverter(key, new AutodetectConverter(resolveOptions(config)))
    }

    const module = await config.converter()
    const implementation = module.default

    if (isVariantConverter(implementation)) {
      return asVariantConverter(key, implementation, resolveOptions(config))
    }

    const converter = typeof implementation === 'function'
      ? new implementation(resolveOptions(config))
      : implementation

    if (!(converter instanceof Converter)) {
      throw new InvalidConverterModuleError(key)
    }

    return asVariantConverter(key, converter)
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

function asVariantConverter(
  key: string,
  converter: Converter | VariantConverter,
  options?: ConverterOptions
): VariantConverter {
  const inheritedBlurhash = converter instanceof Converter ? undefined : converter.blurhash

  return {
    key,
    ...(options?.blurhash !== undefined
      ? { blurhash: options.blurhash }
      : inheritedBlurhash !== undefined
        ? { blurhash: inheritedBlurhash }
        : {}),
    convert(input) {
      return converter instanceof Converter
        ? converter.handle({ ...input, options: converter.options })
        : converter.convert(input)
    },
  }
}

function resolveOptions(config: ConverterConfig): ConverterOptions {
  const { converter: _converter, options, ...direct } = config

  return { ...direct, ...options }
}
