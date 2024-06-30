/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService, LoggerService } from '@adonisjs/core/types'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import { cuid } from '@adonisjs/core/helpers'
import string from '@adonisjs/core/helpers/string'
import { fileTypeFromBuffer } from 'file-type'
import { Exception } from '@poppinss/utils'
import { Attachment } from '../services/attachment_service.js'
import fs, { readFile, mkdir } from 'node:fs/promises'
import { Variant } from '../services/attachment_variant_service.js'
import type { ResolvedAttachmentConfig } from './types.js'
import BaseConverter from './converters/base_converter.js'
import { exif } from './adapters/exif.js'

const REQUIRED_ATTRIBUTES = ['name', 'size', 'extname', 'mimeType']

export class AttachmentManager {
  #app: ApplicationService
  #logger: LoggerService
  #config: ResolvedAttachmentConfig

  constructor(config: ResolvedAttachmentConfig, logger: LoggerService, app: ApplicationService) {
    this.#logger = logger
    this.#app = app
    this.#config = config
  }

  createFromDbResponse(response: any) {
    if (response === null) {
      return null
    }

    const attributes = typeof response === 'string' ? JSON.parse(response) : response

    REQUIRED_ATTRIBUTES.forEach((attribute) => {
      if (attributes[attribute] === undefined) {
        throw new Exception(
          `Cannot create attachment from database response. Missing attribute "${attribute}"`
        )
      }
    })

    return new Attachment(attributes)
  }

  async createFromFile(file: MultipartFile) {
    const attributes = {
      name: file.clientName,
      extname: file.extname!,
      mimeType: `${file.type}/${file.subtype}`,
      size: file.size!,
    }

    if (!file.tmpPath) {
      throw new Error("It's not a valid file")
    }

    const buffer = await readFile(file.tmpPath)

    return new Attachment(attributes, buffer)
  }

  async createFromBuffer(buffer: Buffer, name?: string) {
    const attributes = await this.#attributesTransform(buffer, name)

    return new Attachment(attributes, buffer)
  }

  async createVariant(buffer: Buffer, key: string) {
    const attributes = await this.#attributesTransform(buffer)

    return new Variant({ key, ...attributes }, buffer)
  }

  async getConverter(key: string): Promise<void | BaseConverter> {
    if (this.#config.converters) {
      for (const c of this.#config.converters) {
        if (c.key === key) {
          return c.converter as BaseConverter
        }
      }
    }
  }

  async save(attachment: Attachment) {
    await attachment.beforeSave()
    const publicPath = this.#app.publicPath(attachment.path!)

    try {
      await mkdir(this.#app.publicPath(attachment.options!.folder!), { recursive: true })
      await fs.writeFile(publicPath, attachment.buffer!)
    } catch (err) {
      this.#logger.error({ err }, 'Error send file')
    }
  }

  async delete(attachment: Attachment) {
    if (attachment.path) {
      try {
        const path = this.#app.publicPath(`${attachment.path}`)
        await fs.access(path)
        fs.unlink(path)
      } catch (error) {
        this.#logger.error(error)
      }
    }
  }

  // TODO move helper
  async #attributesTransform(buffer: Buffer, name?: string) {
    const fileType = await fileTypeFromBuffer(buffer)
    const meta = await exif(buffer)

    if (name) {
      name = string.slug(name)
    } else {
      name = `${cuid()}.${fileType!.ext}`
    }

    return {
      name,
      extname: fileType!.ext,
      mimeType: fileType!.mime,
      size: buffer.length,
      meta
    }
  }
}
