/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import path from 'node:path'
import type {
  AttachmentOptions,
  AttachmentAttributes,
  Attachment as AttachmentService,
} from '../src/types/attachment.js'
import type { Input } from '../src/types/input.js'
import { AttachmentBase } from './attachment_base_service.js'
import { Variant } from './attachment_variant_service.js'
import { attachmentParams } from '../src/utils/helpers.js'

export class Attachment extends AttachmentBase implements AttachmentService {
  originalName: string
  options?: AttachmentOptions
  variants?: Variant[]

  constructor(attributes: AttachmentAttributes, input?: Input) {
    super(attributes, input)

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

  async createVariant(key:string, input: Input): Promise<Variant> {
    const attributes = {
      ...await attachmentParams(input),
      key,
      folder: path.join(this.options!.folder!, 'variants', this.name)
    }

    const variant = new Variant(attributes, input)

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
      const data = await attachmentParams(this.input!)

      this.meta = data.meta
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
