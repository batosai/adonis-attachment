/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentAttributes, Variant as VariantService } from '../src/types.js'
import { AttachmentBase } from './attachment_base_service.js'

export class Variant extends AttachmentBase implements VariantService {
  key: string

  constructor(key: string, attributes: AttachmentAttributes, buffer?: Buffer) {
    super(attributes, buffer)

    this.key = key
  }
}
