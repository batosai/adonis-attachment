/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Exif, Input } from './input.js'

export type AttachmentBase = {
  input?: Input

  name: string
  size: number
  extname: string
  mimeType: string
  meta?: Exif
  folder?: string
  path?: string

  beforeSave(): Promise<void>

  toObject(): AttachmentBaseAttributes
  toJSON(): Object
}

export type Attachment = AttachmentBase & {
  originalName: string
  options?: AttachmentOptions
  variants?: Variant[]

  setOptions(options: AttachmentOptions): Attachment
  createVariant(key: string, input: Input): Promise<Variant>
  getVariant(variantName: string): Variant | undefined
  getUrl(variantName?: string): string | undefined
  toObject(): AttachmentAttributes
}

export type Variant = AttachmentBase & {
  key: string
  folder: string

  getUrl(): string | undefined
  toObject(): VariantAttributes
}

export type AttachmentOptions = {
  disk?: string
  folder?: string
  variants?: string[]
}

export type AttachmentBaseAttributes = {
  name?: string
  size: number
  meta?: Exif
  extname: string
  mimeType: string
  folder?: string
  path?: string
}

export type AttachmentAttributes = AttachmentBaseAttributes & {
  variants?: VariantAttributes[]
  originalName: string
}

export type VariantAttributes = AttachmentBaseAttributes & {
  key: string
  folder: string
}
