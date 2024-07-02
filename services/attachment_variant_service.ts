/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import path from 'node:path'
import type { VariantAttributes, Variant as VariantService } from '../src/types/attachment.js'
import type { Input } from '../src/types/input.js'
import { AttachmentBase } from './attachment_base_service.js'

export class Variant extends AttachmentBase implements VariantService {
  key: string
  folder: string

  constructor(attributes: VariantAttributes, input?: Input) {
    super(attributes, input)

    this.meta = attributes.meta
    this.key = attributes.key
    this.folder = attributes.folder!
    this.path = path.join(this.folder, this.name)
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
