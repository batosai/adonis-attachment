/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import path from 'node:path'
import { exif } from '../src/adapters/exif.js'
import type {
  AttachmentOptions,
  AttachmentAttributes,
  Attachment as AttachmentService,
} from '../src/types.js'
import { AttachmentBase } from './attachment_base_service.js'
import { Variant } from './attachment_variant_service.js'
import { attachmentParams } from '../src/utils/helpers.js'

export class Attachment extends AttachmentBase implements AttachmentService {
  originalName: string
  options?: AttachmentOptions
  variants?: Variant[]

  constructor(attributes: AttachmentAttributes, buffer?: Buffer) {
    super(attributes, buffer)

    this.originalName = attributes.originalName

    this.options = {
      disk: 'local',
      folder: 'uploads',
      variants: []
    }

    if (attributes.variants) {
      this.variants = []
      attributes.variants.forEach((v) => this.variants!.push(new Variant(v)))
    }
    // TODO promise.all this.createVariant
  }

  setOptions(options: AttachmentOptions) {
    this.options = {
      ...this.options,
      ...options,
    }
    return this
  }

  async createVariant(key:string, buffer: Buffer): Promise<Variant> {
    const attributes = {
      ...await attachmentParams(buffer),
      key,
      folder: path.join(this.options!.folder!, 'variants', this.name)
    }

    const variant = new Variant(attributes, buffer)

    if (this.variants === undefined) {
      this.variants = []
    }
    this.variants.push(variant)

    return variant
  }

  async beforeSave() {
    this.folder = this.options!.folder!
    const outputPath = path.join(this.folder, this.name)

    if (!this.meta) {
      this.meta = await exif(this.buffer!)
    }
    this.path = outputPath
  }

  toObject(): AttachmentAttributes {
    const variants = this.variants?.map((v) => v.toObject())

    return {
      ...super.toObject(),
      originalName: this.originalName,
      variants
    }
  }
}
