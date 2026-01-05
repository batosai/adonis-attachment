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

  #keyId?: string
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
   * Getters / Setters
   */

  get name(): string {
    return this.#name
  }

  set name(name: string) {
    this.#name = name
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

  getKeyId() {
    return this.#keyId
  }

  setKeyId(keyId: string) {
    this.#keyId = keyId
    return this
  }

  setOptions(options: LucidOptions) {
    this.options = {
      ...this.options,
      ...options,
    }
    return this
  }

  /**
   * Actions
   */

  async computeUrl(signedUrlOptions?: SignedURLOptions) {
    const disk = this.getDisk()
    const fileVisibility = await disk.getVisibility(this.path!)

    if (fileVisibility === 'private') {
      this.url = await this.getSignedUrl(signedUrlOptions)
    } else {
      this.url = await this.getUrl()
    }
  }

  async preComputeUrl() {
    if (this.options?.preComputeUrl === false) {
      return
    }

    await this.computeUrl()
  }

  async makeName(record?: LucidRow, attributeName?: string, originalName?: string) {
    if (typeof this.options.rename === 'function' && record) {
      this.#name = (await (
        this.options.rename as (
          record: LucidRow,
          attributeName?: string,
          originalName?: string
        ) => Promise<string>
      )(record, attributeName, originalName)) as string
    } else if (originalName && this.options.rename === false) {
      this.#name = originalName
    }

    if (this.#name && record) {
      const parameters = extractPathParameters(this.#name)

      if (parameters) {
        parameters.forEach((parameter) => {
          const attribute = record.$attributes[parameter]
          if (typeof attribute === 'string') {
            const name = string.slug(string.noCase(string.escapeHTML(attribute.toLowerCase())))
            this.#name = this.#name?.replace(`:${parameter}`, name)
          }
        })
      }
    }

    return this
  }

  async makeFolder(record?: LucidRow) {
    if (typeof this.options.folder === 'function' && record) {
      this.#folder = (await (this.options.folder as (record: LucidRow) => Promise<string>)(
        record
      )) as string
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

  async put() {
    if (Buffer.isBuffer(this.input)) {
      await this.getDisk().put(this.path, this.input)
    } else if (this.input) {
      await this.getDisk().copyFromFs(this.input, this.path)
    }
  }

  async remove() {
    await this.getDisk().delete(this.path)

    if (this.originalPath) {
      await this.getDisk().delete(this.originalPath)
    }
  }

  /**
   *
   */

  toObject(): AttachmentBaseAttributes {
    return {
      keyId: this.getKeyId(),
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
