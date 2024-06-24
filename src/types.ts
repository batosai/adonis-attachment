/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidRow } from '@adonisjs/lucid/types/model'

export type Exif = {
  orientation?: {
    value: number,
    description: string,
  },
  date?: string,
  host?: string,
  gps?: {
    latitude?: number,
    longitude?: number,
    altitude?: number
  },
  dimension?: {
    width: number,
    height: number
  }
}

export type Attachment  = {
  attributes: AttachmentAttributes
  buffer?: Buffer

  name: string
  size: number
  meta?: Exif
  extname: string
  mimeType: string
  path?: string

  options?: AttachmentOptions

  setOptions(options: AttachmentOptions): Attachment
  beforeSave(): Promise<void>

  toObject(): AttachmentAttributes
  toJSON(): AttachmentAttributes & { url?: string }
}

export type AttachmentOptions = {
  disk?: string,
  folder?: string
}

export type AttachmentAttributes = {
  name: string
  path?: string
  size: number
  meta?: Exif
  extname: string
  mimeType: string
}

export type ModelWithAttachment = LucidRow & {
  attachments: {
    attached: Attachment[],
    detached: Attachment[],
  }
}
