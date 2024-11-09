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

import path from 'node:path'
import { cuid } from '@adonisjs/core/helpers'
import { defaultOptionsDecorator } from '../utils/default_values.js'

export class AttachmentBase implements AttachmentBaseInterface {
  drive: DriveService

  input?: Input

  #name: string
  #folder?: string

  size: number
  extname: string
  mimeType: string
  meta?: Exif
  originalPath?: string
  url?: string

  options?: LucidOptions

  constructor(drive: DriveService, attributes: AttachmentBaseAttributes, input?: Input) {
    this.input = input

    this.size = attributes.size
    this.meta = attributes.meta
    this.extname = attributes.extname
    this.mimeType = attributes.mimeType
    this.originalPath = attributes.path

    this.#folder = attributes.folder
    if (attributes.name) {
      this.#name = attributes.name
    } else {
      this.#name = `${cuid()}.${this.extname}`
    }

    this.options = defaultOptionsDecorator
    this.drive = drive
  }

  /**
   * Getters
   */

  get name(): string {
    return this.#name
  }

  get folder(): string | undefined {
    if (this.options) {
      return this.options?.folder
    }
    return this.#folder
  }

  get path(): string {
    return path.join(this.folder!, this.name)
  }

  /**
   * Methods
   */

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

  /**
   *
   */

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

  toJSON(): Object {
    if (this.url) {
      return {
        ...this.toObject(),
        url: this.url,
      }
    }

    return this.toObject()
  }
}
