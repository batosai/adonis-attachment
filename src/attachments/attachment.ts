/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type {
  AttachmentOptions,
  AttachmentAttributes,
  Attachment as AttachmentInterface,
} from '../types/attachment.js'
import type { Input } from '../types/input.js'

import path from 'node:path'
import { AttachmentBase } from './attachment_base.js'
import { Variant } from './variant_attachment.js'
import { createAttachmentAttributes } from '../utils/helpers.js'
import { defaultOptionsDecorator } from '../utils/default_values.js'

export class Attachment extends AttachmentBase implements AttachmentInterface {
  originalName: string
  options?: AttachmentOptions
  variants?: Variant[]

  constructor(attributes: AttachmentAttributes, input?: Input) {
    super(attributes, input)

    this.originalName = attributes.originalName

    this.options = defaultOptionsDecorator

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

  async createVariant(key: string, input: Input): Promise<Variant> {
    const attributes = {
      ...(await createAttachmentAttributes(input)),
      key,
      folder: path.join(this.options!.folder!, 'variants', this.name),
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
      const data = await createAttachmentAttributes(this.input!)

      this.meta = data.meta
    }
    this.path = outputPath
  }

  toObject(): AttachmentAttributes {
    const variants = this.variants?.map((v) => v.toObject())

    return {
      ...super.toObject(),
      originalName: this.originalName,
      variants,
    }
  }
}
