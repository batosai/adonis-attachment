/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { DriveService } from '@adonisjs/drive/types'
import type { VariantAttributes, Variant as VariantInterface } from '../types/attachment.js'
import type { Input } from '../types/input.js'

import { AttachmentBase } from './attachment_base.js'

export class Variant extends AttachmentBase implements VariantInterface {
  key: string
  #folder: string

  constructor(drive: DriveService, attributes: VariantAttributes, input?: Input) {
    super(drive, attributes, input)

    this.key = attributes.key
    this.#folder = attributes.folder!
  }

  /**
   * Getters
   */

  get folder(): string {
    return this.#folder
  }

  /**
   *
   */

  toObject(): VariantAttributes {
    return {
      key: this.key,
      folder: this.folder!,
      name: this.name,
      ...super.toObject(),
    }
  }
}
