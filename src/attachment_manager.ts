/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LoggerService } from '@adonisjs/core/types'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type { AttachmentBase, Variant } from './types/attachment.js'
import type { ResolvedAttachmentConfig } from './types/config.js'

import path from 'node:path'
import fs from 'node:fs/promises'
import { Exception } from '@poppinss/utils'
import { Attachment } from './attachments/attachment.js'
import Converter from './converters/converter.js'
import { createAttachmentAttributes } from './utils/helpers.js'

const REQUIRED_ATTRIBUTES = ['name', 'size', 'extname', 'mimeType']

export class AttachmentManager {
  // #app: ApplicationService
  #logger: LoggerService
  #config: ResolvedAttachmentConfig

  constructor(config: ResolvedAttachmentConfig, logger: LoggerService) {
    // constructor(config: ResolvedAttachmentConfig, logger: LoggerService, app: ApplicationService) {
    this.#logger = logger
    // this.#app = app
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
    const attributes = await createAttachmentAttributes(buffer, name)

    return new Attachment(attributes, buffer)
  }

  async getConverter(key: string): Promise<void | Converter> {
    if (this.#config.converters) {
      for (const c of this.#config.converters) {
        if (c.key === key) {
          return c.converter as Converter
        }
      }
    }
  }

  async save(attachment: AttachmentBase) {
    await attachment.beforeSave()
    const destinationPath = path.join(this.#config.basePath, attachment.path!)

    try {
      await fs.mkdir(path.join(this.#config.basePath, attachment.folder!), { recursive: true })
      if (Buffer.isBuffer(attachment.input)) {
        await fs.writeFile(destinationPath, attachment.input)
      } else if (attachment.input) {
        await fs.copyFile(attachment.input, destinationPath)
      }
    } catch (err) {
      this.#logger.error({ err }, 'Error send file')
    }
  }

  async delete(attachment: Attachment | Variant) {
    if (attachment.path) {
      try {
        const filePath = path.join(this.#config.basePath, attachment.path)

        try {
          await fs.access(filePath)
          await fs.unlink(filePath)
        } catch (accessError) {
          if (accessError.code === 'ENOENT') {
            this.#logger.warn(`File not found: ${filePath}`)
          } else {
            throw accessError
          }
        }

        if (attachment instanceof Attachment) {
          if (attachment.variants) {
            // await Promise.all(attachment.variants.map((v) => this.delete(v)))
            const variantPath = path.join(this.#config.basePath, attachment.variants[0].folder, path.sep)
            try {
              await fs.rm(variantPath, { recursive: true, force: true })
            } catch (rmError) {
              this.#logger.error(`Failed to remove variants folder: ${rmError.message}`)
            }
          }
        }
      } catch (error) {
        this.#logger.error(error);
      }
    }
  }
}
