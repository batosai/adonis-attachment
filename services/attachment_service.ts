/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { cuid } from '@adonisjs/core/helpers'
import path from 'node:path'
import { exif } from '../src/adapters/exif.js'
import type { AttachmentOptions, AttachmentAttributes, AttachmentService, Exif } from '../src/types.js'

export class Attachment implements AttachmentService {

  attributes: AttachmentAttributes
  buffer?: Buffer

  name: string
  size: number
  meta?: Exif
  extname: string
  mimeType: string
  path?: string

  options?: AttachmentOptions

  constructor(attributes: AttachmentAttributes, buffer?: Buffer) {
    this.attributes = attributes
    this.buffer = buffer

    this.name = attributes.name
    this.size = attributes.size
    this.extname = attributes.extname
    this.mimeType = attributes.mimeType
    this.path = attributes.path

    this.options = {
      disk: 'fs',
      folder: 'public/uploads'
    }
  }

  setOptions(options: AttachmentOptions) {
    this.options = options
    return this
  }

  async beforeSave() {
    const name = `${cuid()}.${this.attributes.extname}`
    const outputPath = path.join(this.options!.folder, name)

    this.meta = await exif(this.buffer!)
    this.path = outputPath
  }

  toObject(): AttachmentAttributes {
    return {
      name: this.name,
      extname: this.extname,
      size: this.size,
      meta: this.meta,
      mimeType: this.mimeType,
      path: this.path
    }
  }

  toJSON(): AttachmentAttributes & { url?: string } {
    return {
      // ...(this.url ? { url: this.url } : {}),
      ...this.toObject(),
    }
  }
}
