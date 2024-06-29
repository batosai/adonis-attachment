/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidRow } from '@adonisjs/lucid/types/model'

export type Exif = {
  orientation?: {
    value: number
    description?: string
  }
  date?: string
  host?: string
  gps?: {
    latitude?: number
    longitude?: number
    altitude?: number
  }
  dimension?: {
    width: number
    height: number
  }
}

export type AttachmentBase = {
  buffer?: Buffer

  name: string
  size: number
  meta?: Exif
  extname: string
  mimeType: string
  path?: string

  beforeSave(): Promise<void>

  toObject(): AttachmentAttributes
  toJSON(): AttachmentAttributes & { url?: string }
}

export type Attachment = AttachmentBase & {
  options?: AttachmentOptions
  variants?: Variant[]

  setOptions(options: AttachmentOptions): Attachment
  addVariant(variant: Variant): void
}

export type Variant = AttachmentBase & {
  key: string
}

export type AttachmentOptions = {
  disk?: string
  folder?: string
}

export type AttachmentAttributes = {
  name: string
  path?: string
  size: number
  meta?: Exif
  extname: string
  mimeType: string
  variants?: AttachmentAttributes[] | Variant[]
}

// --- Mixin

export type ModelWithAttachment = LucidRow & {
  attachments: {
    attached: Attachment[]
    detached: Attachment[]
  }
}

// --- Converter & Config

export type BaseConverter = {
  buffer?: Buffer
  options?: Object
  record?: ModelWithAttachment
  attribute?: string

  handle?(attributes: ConverterAttributes): void
  save(): void
}

export type ConverterAttributes = {
  record: ModelWithAttachment
  attribute: string
}

type ImportConverter = {
  default: unknown
}

type Converter = {
  key: string
  converter: () => Promise<ImportConverter>
  options?: ConverterOptions
}

export type AttachmentConfig = {
  basePath: string
  converters?: Converter[]
}

export type ResolvedConverter = {
  key: string
  converter: BaseConverter
}

export type ResolvedAttachmentConfig = {
  basePath: string
  converters?: ResolvedConverter[]
}

type jpeg = {
  format: 'jpeg',
  options: {
    quality?: number,
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
  format: 'png',
  options: {
    quality?: number,
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
  format: 'gif',
  options: {
    reuse?: Boolean,
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
  format: 'webp',
  options: {
    quality?: number,
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
  resize: number | {
    width?: number,
    height?: number,
    fit?: string,
    position?: string,
    background?: string | {
      r: number,
      g: number,
      b: number,
      alpha: number
    },
    kernel?: string,
    withoutEnlargement?: Boolean,
    withoutReduction?: Boolean,
    fastShrinkOnLoad?: Boolean,

  },
  format?: string | jpeg | png | gif | webp
}