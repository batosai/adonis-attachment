/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { VariantAttributes, Variant as VariantInterface } from '../types/attachment.js'
import type { Input } from '../types/input.js'

import path from 'node:path'
import { AttachmentBase } from './attachment_base.js'

export class Variant extends AttachmentBase implements VariantInterface {
  key: string
  folder: string

  constructor(attributes: VariantAttributes, input?: Input) {
    super(attributes, input)

    this.meta = attributes.meta
    this.key = attributes.key
    this.folder = attributes.folder!
    this.path = path.join(this.folder, this.name)
  }

  getUrl() {
    if (this.path) {
      return path.join(path.sep, this.path)
    }
  }

  toObject(): VariantAttributes {
    return {
      key: this.key,
      folder: this.folder,
      name: this.name,
      ...super.toObject(),
    }
  }
}
