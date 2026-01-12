/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidRow } from '@adonisjs/lucid/types/model'
import type { DriveService } from '@adonisjs/drive/types'
import type { Exif, Input } from './input.js'
import type { Disk } from '@adonisjs/drive'
import type { SignedURLOptions } from '@adonisjs/drive/types'
import type { AttachmentVariants } from '@jrmc/adonis-attachment'
import { BlurhashOptions } from './converter.js'

export type AttachmentBase = {
  drive: DriveService

  input?: Input

  name: string
  folder?: string
  path?: string

  size: number
  extname: string
  mimeType: string
  meta?: Exif
  originalPath?: string
  url?: string

  options: LucidOptions

  getDisk(): Disk
  getBytes(): Promise<Uint8Array>
  getBuffer(): Promise<Buffer>
  getStream(): Promise<NodeJS.ReadableStream>
  getUrl(): Promise<string>
  getSignedUrl(signedUrlOptions?: SignedURLOptions): Promise<string>
  getKeyId(): string | undefined

  setKeyId(keyId: string): AttachmentBase
  setOptions(options: LucidOptions): AttachmentBase

  computeUrl(signedUrlOptions?: SignedURLOptions): Promise<void>
  preComputeUrl(): Promise<void>
  makeFolder(record?: LucidRow): void
  makeName(record?: LucidRow, attributeName?: string, originalName?: string): void
  put(): Promise<void>
  remove(): Promise<void>

  toObject(): AttachmentBaseAttributes
  toJSON(): Object
}

export type Attachment = AttachmentBase & {
  originalName: string
  variants?: Variant[]

  createVariant(key: string, input: Input, basePath?: string): Promise<Variant>
  getVariant(variantName: string): Variant | null
  getUrl(variantName?: string): Promise<string>
  getSignedUrl(
    variantNameOrOptions?: string | SignedURLOptions,
    signedUrlOptions?: SignedURLOptions
  ): Promise<string>

  preComputeUrl(): Promise<void>
  moveFileForDelete(): Promise<void>
  rollbackMoveFileForDelete(): Promise<void>
  remove(): Promise<void>

  toObject(): AttachmentAttributes
}

export type Variant = AttachmentBase & {
  key: string
  folder: string
  blurhash?: string

  generateBlurhash(options?: BlurhashOptions): void
  toObject(): VariantAttributes
}

export type LucidOptions<T = LucidRow> = {
  disk?: string
  folder?: string | ((record: T) => string) | ((record: T) => Promise<string>)
  rename?:
    | boolean
    | ((record: T, column?: string, currentName?: string) => string)
    | ((record: T, column?: string, currentName?: string) => Promise<string>)
  preComputeUrl?: boolean
  variants?: (keyof AttachmentVariants)[]
  meta?: boolean
  serialize?: (value?: Attachment) => unknown
  serializeAs?: string | null
}

export type AttachmentBaseAttributes = {
  keyId?: string
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
  blurhash?: string
}
