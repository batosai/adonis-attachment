/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService, LoggerService } from '@adonisjs/core/types'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import { Exception } from '@poppinss/utils'
import { Attachment } from '../services/attachment_service.js'
import fs from 'node:fs/promises'
import type { AttachmentBase, Variant } from './types/attachment.js'
import type { ResolvedAttachmentConfig } from './types/config.js'
import BaseConverter from './converters/base_converter.js'
import { attachmentParams } from './utils/helpers.js'

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
      originalName: file.clientName,
      extname: file.extname!,
      mimeType: `${file.type}/${file.subtype}`,
      size: file.size!,
    }

    if (!file.tmpPath) {
      throw new Error("It's not a valid file")
    }

    // const buffer = await fs.readFile(file.tmpPath)

    return new Attachment(attributes, file.tmpPath)
    // return new Attachment(attributes, buffer)
  }

  async createFromBuffer(buffer: Buffer, name?: string) {
    const attributes = await attachmentParams(buffer, name)

    return new Attachment(attributes, buffer)
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

  async save(attachment: AttachmentBase) {
    await attachment.beforeSave()
    const publicPath = this.#app.publicPath(attachment.path!)

    try {
      await fs.mkdir(this.#app.publicPath(attachment.folder!), { recursive: true })
      if (Buffer.isBuffer(attachment.input)) {
        await fs.writeFile(publicPath, attachment.input)
      } else if (attachment.input) {
        await fs.copyFile(attachment.input, publicPath)
      }
    } catch (err) {
      this.#logger.error({ err }, 'Error send file')
    }
  }

  async delete(attachment: Attachment | Variant) {
    if (attachment.path) {
      try {
        const path = this.#app.publicPath(attachment.path)
        await fs.access(path)
        await fs.unlink(path)

        if (attachment instanceof Attachment) {
          if (attachment.variants) {
            await Promise.all(
              attachment.variants.map((v) => this.delete(v))
            )
            const path = this.#app.publicPath(attachment.variants[0].folder + '/')
            await fs.rm(path, { recursive: true, force: true })
          }
        }

      } catch (error) {
        this.#logger.error(error)
      }
    }
  }
}
