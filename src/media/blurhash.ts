/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { MissingOptionalDependencyError } from '../errors.js'
import { loadOptionalDependency } from '../utils/optional_dependency.js'

export type BlurhashComponent = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** Matches the v5 blurhash declaration accepted by converter configuration. */
export type BlurhashOptions =
  | boolean
  | {
      enabled: boolean
      componentX?: BlurhashComponent
      componentY?: BlurhashComponent
    }

export type BlurhashGeneratorInput = {
  body: Uint8Array
  componentX: BlurhashComponent
  componentY: BlurhashComponent
}

/** Generates a blurhash from the final bytes of an image variant. */
export interface BlurhashGenerator {
  generate(input: BlurhashGeneratorInput): Promise<string>
  generateFile?(input: Omit<BlurhashGeneratorInput, 'body'> & { path: string }): Promise<string>
}

type SharpRawImage = {
  resize?(width: number, height: number, options: { fit: 'inside'; withoutEnlargement: true }): SharpRawImage
  raw(): SharpRawImage
  ensureAlpha(): SharpRawImage
  toBuffer(options: { resolveWithObject: true }): Promise<{
    data: Uint8Array
    info: { width: number; height: number }
  }>
}

export type BlurhashSharpFactory = (input: Uint8Array) => SharpRawImage
export type BlurhashEncoder = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  componentX: BlurhashComponent,
  componentY: BlurhashComponent
) => string | Promise<string>

/** Builds a generator from injected Sharp and blurhash implementations. */
export function createSharpBlurhashGenerator(
  sharp: BlurhashSharpFactory,
  encode: BlurhashEncoder
): BlurhashGenerator {
  return {
    generate: ({ body, componentX, componentY }) => encodeImage(sharp(body), encode, componentX, componentY),
  }
}

async function encodeImage(image: SharpRawImage, encode: BlurhashEncoder, x: BlurhashComponent, y: BlurhashComponent) {
  const resized = image.resize?.(64, 64, { fit: 'inside', withoutEnlargement: true }) ?? image
  const { data, info } = await resized.raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  return encode(new Uint8ClampedArray(data), info.width, info.height, x, y)
}

/** Loads the optional Sharp and blurhash dependencies only when a converter enables blurhash. */
export class DynamicBlurhashGenerator implements BlurhashGenerator {
  #generator: Promise<BlurhashGenerator> | undefined

  generate(input: BlurhashGeneratorInput): Promise<string> {
    this.#generator ??= loadGenerator()
    return this.#generator.then((generator) => generator.generate(input))
  }
  generateFile(input: Omit<BlurhashGeneratorInput, 'body'> & { path: string }): Promise<string> {
    this.#generator ??= loadGenerator()
    return this.#generator.then((generator) => generator.generateFile!(input))
  }

}

export function isBlurhashEnabled(options: BlurhashOptions | undefined): boolean {
  return options === true || (typeof options === 'object' && options.enabled)
}

export function resolveBlurhashComponents(
  options: BlurhashOptions | undefined
): Pick<BlurhashGeneratorInput, 'componentX' | 'componentY'> {
  return {
    componentX: typeof options === 'object' ? options.componentX ?? 4 : 4,
    componentY: typeof options === 'object' ? options.componentY ?? 4 : 4,
  }
}

async function loadGenerator(): Promise<BlurhashGenerator> {
  const [sharpModule, blurhashModule] = await Promise.all([
    loadOptionalDependency<{ default?: unknown }>('sharp'),
    loadOptionalDependency<{ encode?: unknown }>('blurhash'),
  ])

  if (typeof sharpModule.default !== 'function' || typeof blurhashModule.encode !== 'function') {
    throw new MissingOptionalDependencyError(['sharp', 'blurhash'])
  }

  const sharp = sharpModule.default as (input: Uint8Array | string) => SharpRawImage
  const encode = blurhashModule.encode as BlurhashEncoder
  return {
    ...createSharpBlurhashGenerator(sharp, encode),
    generateFile: ({ path, componentX, componentY }) => encodeImage(sharp(path), encode, componentX, componentY),
  }
}
