/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Exif, Input } from "./input.js"

export type AttachmentBase = {
  input?: Input

  name: string
  size: number
  meta?: Exif
  extname: string
  mimeType: string
  folder?: string
  path?: string

  beforeSave(): Promise<void>

  toObject(): AttachmentBaseAttributes
  toJSON(): AttachmentBaseAttributes & { url?: string }
}

export type Attachment = AttachmentBase & {
  originalName: string
  options?: AttachmentOptions
  variants?: Variant[]

  setOptions(options: AttachmentOptions): Attachment
  createVariant(key:string, input: Input): Promise<Variant>
  toObject(): AttachmentAttributes
}

export type Variant = AttachmentBase & {
  key: string
  folder: string

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
  originalName: string,
}

export type VariantAttributes = AttachmentBaseAttributes & {
  key: string
  folder: string
}