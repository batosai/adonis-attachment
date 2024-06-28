/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { cuid } from '@adonisjs/core/helpers'
import path from 'node:path'
import { exif } from '../src/adapters/exif.js'
import type {
  AttachmentOptions,
  AttachmentAttributes,
  Attachment as AttachmentService,
  Variant,
} from '../src/types.js'
import { AttachmentBase } from './attachment_base_service.js'

export class Attachment extends AttachmentBase implements AttachmentService {
  options?: AttachmentOptions
  variants?: Variant[]

  constructor(attributes: AttachmentAttributes, buffer?: Buffer) {
    super(attributes, buffer)

    this.options = {
      disk: 'local',
      folder: 'uploads',
    }
  }

  setOptions(options: AttachmentOptions) {
    this.options = {
      ...this.options,
      ...options,
    }
    return this
  }

  addVariant(variant: Variant) {
    this.variants?.push(variant)
  }

  async beforeSave() {
    const name = `${cuid()}.${this.extname}`
    const outputPath = path.join(this.options!.folder!, name)

    this.meta = await exif(this.buffer!)
    this.path = outputPath
  }
}
