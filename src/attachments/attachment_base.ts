/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidRow } from '@adonisjs/lucid/types/model'
import string from '@adonisjs/core/helpers/string'
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
import { extractPathParameters } from '../utils/helpers.js'

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

  options: LucidOptions

  constructor(drive: DriveService, attributes: AttachmentBaseAttributes, input?: Input) {
    this.input = input

    this.size = attributes.size
    this.meta = attributes.meta
    this.extname = attributes.extname
    this.mimeType = attributes.mimeType
    this.originalPath = attributes.path

    this.#folder = attributes.folder
    this.setOptions({ folder: attributes.folder })

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
    if (this.#folder) {
      return this.#folder
    }

    if (typeof this.options.folder === 'string') {
      const parameters = extractPathParameters(this.options.folder)
      if (!parameters.length) {
        return this.options.folder
      }
    }
  }

  get path(): string {
    if (!this.folder && this.originalPath) {
      return this.originalPath
    }

    return path.join(this.folder!, this.name)
  }

  /**
   * Methods
   */

  getDisk() {
    return this.drive.use(this.options?.disk)
  }

  getBytes() {
    return this.getDisk().getBytes(this.path)
  }

  async getBuffer() {
    const arrayBuffer = await this.getBytes()
    return Buffer.from(arrayBuffer)
  }

  getStream() {
    return this.getDisk().getStream(this.path)
  }

  getUrl() {
    return this.getDisk().getUrl(this.path)
  }

  getSignedUrl(signedUrlOptions?: SignedURLOptions) {
    return this.getDisk().getSignedUrl(this.path, signedUrlOptions)
  }

  setOptions(options: LucidOptions) {
    this.options = {
      ...this.options,
      ...options,
    }
    return this
  }

  makeFolder(record?: LucidRow) {
    if (typeof this.options.folder === 'function' && record) {
      this.#folder = this.options.folder(record)
    } else if (this.options.folder) {
      this.#folder = this.options.folder as string
    }

    if (this.#folder && record) {
      const parameters = extractPathParameters(this.#folder)

      if (parameters) {
        parameters.forEach((parameter) => {
          const attribute = record.$attributes[parameter]
          if (typeof attribute === 'string') {
            const name = string.slug(string.noCase(string.escapeHTML(attribute.toLowerCase())))
            this.#folder = this.#folder?.replace(`:${parameter}`, name)
          }
        })
      }
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
