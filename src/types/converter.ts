/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Input } from './input.js'
import type { ModelWithAttachment } from './mixin.js'

export type Converter = {
  input?: Input
  options?: Object
  record?: ModelWithAttachment
  attributeName?: string

  initialize(attributes?: ConverterInitializeAttributes): void
  handle(attributes: ConverterAttributes): Promise<Input | undefined>
  save(): void
}

export type ConverterInitializeAttributes = {
  record: ModelWithAttachment
  attributeName: string
  key: string
}

export type ConverterAttributes = {
  key: string
  input: Input
  options: ConverterOptions
}

type jpeg = {
  format: 'jpeg'
  options: {
    quality?: number
    progressive?: Boolean
    chromaSubsampling?: string
    optimiseCoding?: Boolean
    optimizeCoding?: Boolean
    mozjpeg?: Boolean
    trellisQuantisation?: Boolean
    overshootDeringing?: Boolean
    optimiseScans?: Boolean
    optimizeScans?: Boolean
    quantisationTable?: number
    quantizationTable?: number
    force?: Boolean
  }
}

type png = {
  format: 'png'
  options: {
    quality?: number
    progressive?: Boolean
    compressionLevel?: number
    adaptiveFiltering?: Boolean
    palette?: Boolean
    effort?: number
    colours?: number
    colors?: number
    dither?: number
    force?: Boolean
  }
}

type gif = {
  format: 'gif'
  options: {
    reuse?: Boolean
    progressive?: Boolean
    colours?: number
    colors?: number
    effort?: number
    dither?: number
    interFrameMaxError?: number
    interPaletteMaxError?: number
    loop?: number
    delay?: number | number[]
    force?: Boolean
  }
}

type webp = {
  format: 'webp'
  options: {
    quality?: number
    alphaQuality?: number
    lossless?: Boolean
    nearLossless?: Boolean
    smartSubsample?: Boolean
    preset?: string
    effort?: number
    loop?: number
    delay?: number | number[]
    minSize?: Boolean
    mixed?: Boolean
    force?: Boolean
  }
}

export type ConverterOptions = {
  resize:
    | number
    | {
        width?: number
        height?: number
        fit?: string
        position?: string
        background?:
          | string
          | {
              r: number
              g: number
              b: number
              alpha: number
            }
        kernel?: string
        withoutEnlargement?: Boolean
        withoutReduction?: Boolean
        fastShrinkOnLoad?: Boolean
      }
  format?: string | jpeg | png | gif | webp
}
