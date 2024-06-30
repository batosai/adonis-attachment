/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type {
  AttachmentBaseAttributes,
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

  constructor(attributes: AttachmentBaseAttributes, buffer?: Buffer) {
    this.buffer = buffer

    this.name = attributes.name
    this.size = attributes.size
    this.extname = attributes.extname
    this.mimeType = attributes.mimeType
    this.path = attributes.path
  }

  async beforeSave() {}

  toObject(): AttachmentBaseAttributes {
    return {
      name: this.name,
      extname: this.extname,
      size: this.size,
      meta: this.meta,
      mimeType: this.mimeType,
      path: this.path
    }
  }

  toJSON(): AttachmentBaseAttributes & { url?: string } {
    return {
      // ...(this.url ? { url: this.url } : {}),
      ...this.toObject(),
    }
  }
}
