/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentBaseAttributes, AttachmentBase as AttachmentService } from '../src/types/attachment.js'
import type { Exif, Input } from '../src/types/input.js'
import { cuid } from '@adonisjs/core/helpers'

export class AttachmentBase implements AttachmentService {
  input?: Input

  name: string
  size: number
  meta?: Exif
  extname: string
  mimeType: string
  folder?: string
  path?: string

  constructor(attributes: AttachmentBaseAttributes, input?: Input) {
    this.input = input
    
    this.size = attributes.size
    this.meta = attributes.meta
    this.extname = attributes.extname
    this.mimeType = attributes.mimeType
    this.folder = attributes.folder
    this.path = attributes.path

    if (attributes.name) {
      this.name = attributes.name
    } else {
      this.name = `${cuid()}.${this.extname}`
    }
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
