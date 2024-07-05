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

  getVariant(variantName: string) {
    return this.variants?.find((v) => v.key === variantName)
  }

  getUrl(variantName?: string) {
    if (variantName) {
      const variant = this.getVariant(variantName)
      if (variant) {
        return variant.getUrl()
      }
    }

    if (this.path) {
      return path.join(path.sep, this.path)
    }
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

  toJSON(): Object {
    const data: any = {
      // ...(this.url ? { url: this.url } : {}),
      // ...this.toObject(),
      name: this.name,
      originalName: this.originalName,
      size: this.size,
      extname: this.extname,
      mimetype: this.mimeType,
      meta: this.meta,
    }

    this.variants?.forEach((v) => data[v.key] = v.getUrl())

    return data
  }
}
