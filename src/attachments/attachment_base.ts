/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { DriveService, SignedURLOptions } from '@adonisjs/drive/types'
import type {
  LucidOptions,
  AttachmentBaseAttributes,
  AttachmentBase as AttachmentBaseInterface,
} from '../types/attachment.js'
import type { Exif, Input } from '../types/input.js'

import { cuid } from '@adonisjs/core/helpers'
import { defaultOptionsDecorator } from '../utils/default_values.js'

export class AttachmentBase implements AttachmentBaseInterface {
  drive: DriveService

  input?: Input

  name: string
  size: number
  extname: string
  mimeType: string
  meta?: Exif
  folder?: string
  path?: string

  options?: LucidOptions

  constructor(drive: DriveService, attributes: AttachmentBaseAttributes, input?: Input) {
    this.input = input

    this.size = attributes.size
    this.meta = attributes.meta
    this.extname = attributes.extname
    this.mimeType = attributes.mimeType
    this.folder = attributes.folder
    this.path = attributes.path

    this.options = defaultOptionsDecorator

    this.drive = drive

    if (attributes.name) {
      this.name = attributes.name
    } else {
      this.name = `${cuid()}.${this.extname}`
    }
  }

  getDisk() {
    return this.drive.use(this.options?.disk)
  }

  getUrl() {
    return this.getDisk().getUrl(this.path!)
  }

  getSignedUrl(signedUrlOptions?: SignedURLOptions) {
    return this.getDisk().getSignedUrl(this.path!, signedUrlOptions)
  }

  setOptions(options: LucidOptions) {
    this.options = {
      ...this.options,
      ...options,
    }
    return this
  }

  toObject(): AttachmentBaseAttributes {
    return {
      name: this.name,
      extname: this.extname,
      size: this.size,
      meta: this.meta,
      mimeType: this.mimeType,
      path: this.path,
    }
  }

  async toJSON(): Promise<Object> {
    return {
      ...this.toObject(),
      url: await this.getUrl(),
      signedUrl: await this.getSignedUrl(),
    }
  }
}
