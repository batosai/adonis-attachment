/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type {
  AttachmentAttributes,
  AttachmentBase as AttachmentService,
  Exif,
} from '../src/types.js'

export class AttachmentBase implements AttachmentService {
  buffer?: Buffer

  name: string
  size: number
  meta?: Exif
  extname: string
  mimeType: string
  path?: string

  constructor(attributes: AttachmentAttributes, buffer?: Buffer) {
    this.buffer = buffer

    this.name = attributes.name
    this.size = attributes.size
    this.extname = attributes.extname
    this.mimeType = attributes.mimeType
    this.path = attributes.path
  }

  async beforeSave() {}

  toObject(): AttachmentAttributes {
    return {
      name: this.name,
      extname: this.extname,
      size: this.size,
      meta: this.meta,
      mimeType: this.mimeType,
      path: this.path,
    }
  }

  toJSON(): AttachmentAttributes & { url?: string } {
    return {
      // ...(this.url ? { url: this.url } : {}),
      ...this.toObject(),
    }
  }
}
