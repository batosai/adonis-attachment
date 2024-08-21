/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { DriveService } from '@adonisjs/drive/types'
import type { Exif, Input } from './input.js'
import type { Disk } from '@adonisjs/drive'
import type { SignedURLOptions } from '@adonisjs/drive/types'

export type AttachmentBase = {
  drive: DriveService

  input?: Input

  name: string
  size: number
  extname: string
  mimeType: string
  meta?: Exif
  folder?: string
  path?: string

  options?: LucidOptions

  getDisk(): Disk
  getUrl(): Promise<string>
  getSignedUrl(signedUrlOptions?: SignedURLOptions): Promise<string>

  setOptions(options: LucidOptions): AttachmentBase

  toObject(): AttachmentBaseAttributes
  toJSON(): Promise<Object>
}

export type Attachment = AttachmentBase & {
  originalName: string
  variants?: Variant[]

  createVariant(key: string, input: Input): Promise<Variant>
  getVariant(variantName: string): Variant | undefined
  getUrl(variantName?: string): Promise<string>
  getSignedUrl(variantNameOrOptions?: string | SignedURLOptions, signedUrlOptions?: SignedURLOptions): Promise<string>
  toObject(): AttachmentAttributes
}

export type Variant = AttachmentBase & {
  key: string
  folder: string

  toObject(): VariantAttributes
}

export type LucidOptions = {
  disk?: string
  folder?: string
  variants?: string[]
  rename?: boolean
  meta?: boolean
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
