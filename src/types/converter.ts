/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Record } from './service.js'
import type { BinPaths } from './config.js'
import type { Input } from './input.js'
import type { LucidOptions } from './attachment.js'

export type Converter = {
  options?: ConverterOptions
  binPaths?: BinPaths
  handle?: (attributes: ConverterAttributes) => Promise<Input | undefined>
}

export type ConverterInitializeAttributes = {
  record: Record
  attributeName: string
  options: LucidOptions
}

export type ConverterAttributes = {
  input: Input
  options: ConverterOptions
}

export type BlurhashOptions = {
  enabled: boolean
  componentX: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  componentY: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
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

type avif = {
  format: 'avif'
  options: {
    quality?: number
    lossless?: Boolean
    effort?: number
    chromaSubsampling?: string
    bitdepth?: number
  }
}

type heif = {
  format: 'heif'
  options: {
    compression?: string
    quality?: number
    lossless?: Boolean
    effort?: number
    chromaSubsampling?: string
    bitdepth?: number
  }
}

export type ConverterOptions = {
  resize?:
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
  format?:
    | 'jpeg'
    | 'jpg'
    | 'png'
    | 'gif'
    | 'webp'
    | 'avif'
    | 'heif'
    | 'tiff'
    | 'raw'
    | jpeg
    | png
    | gif
    | webp
    | avif
    | heif
  blurhash?: boolean | BlurhashOptions
}
