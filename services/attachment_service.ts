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
} from '../src/types.js'
import { AttachmentBase } from './attachment_base_service.js'
import { Variant } from './attachment_variant_service.js'

export class Attachment extends AttachmentBase implements AttachmentService {
  options?: AttachmentOptions
  variants?: Variant[]

  constructor(attributes: AttachmentAttributes  & { variants?: AttachmentAttributes[] }, buffer?: Buffer) {
    super(attributes, buffer)

    this.options = {
      disk: 'local',
      folder: 'uploads',
      variants: []
    }

    if (attributes.variants) {
      this.variants = []
      attributes.variants.forEach((v) => this.variants!.push(new Variant(v)))
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
    if (this.variants === undefined) {
      this.variants = []
    }
    this.variants.push(variant)
  }

  async beforeSave() {
    const name = `${cuid()}.${this.extname}`
    const outputPath = path.join(this.options!.folder!, name)

    if (!this.meta) {
      this.meta = await exif(this.buffer!)
    }
    this.path = outputPath
  }

  toObject(): AttachmentAttributes & { variants?: AttachmentAttributes[] } {
    const variants = this.variants?.map((v) => v.toObject())

    return {
      ...super.toObject(),
      variants
    }
  }
}
