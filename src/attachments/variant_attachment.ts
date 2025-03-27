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
import { BlurhashOptions } from '../types/converter.js'
import { imageToBlurhash } from '../utils/helpers.js'

export class Variant extends AttachmentBase implements VariantInterface {
  key: string
  #folder: string
  blurhash?: string

  constructor(drive: DriveService, attributes: VariantAttributes, input?: Input) {
    super(drive, attributes, input)

    this.key = attributes.key
    this.#folder = attributes.folder!
    this.blurhash = attributes.blurhash
  }

  async generateBlurhash(options?: BlurhashOptions) {
    this.blurhash = await imageToBlurhash(this.input!, options)
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
      blurhash: this.blurhash,
      ...super.toObject(),
    }
  }
}
