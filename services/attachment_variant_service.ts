/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { VariantAttributes, Variant as VariantService } from '../src/types.js'
import { AttachmentBase } from './attachment_base_service.js'

export class Variant extends AttachmentBase implements VariantService {
  key: string

  constructor(attributes: VariantAttributes, buffer?: Buffer) {
    super(attributes, buffer)

    this.meta = attributes.meta
    this.key = attributes.key
  }

  toObject(): VariantAttributes {
    return {
      key: this.key,
      ...super.toObject(),
    }
  }
}
