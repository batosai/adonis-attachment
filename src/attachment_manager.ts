/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LoggerService } from '@adonisjs/core/types'
import type { DriveService } from '@adonisjs/drive/types'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type { AttachmentBase, Attachment as AttachmentType } from './types/attachment.js'
import type { ResolvedAttachmentConfig } from './types/config.js'

import { Exception } from '@poppinss/utils'
import { Attachment } from './attachments/attachment.js'
import Converter from './converters/converter.js'
import { createAttachmentAttributes } from './utils/helpers.js'
import { exif } from './adapters/exif.js'

const REQUIRED_ATTRIBUTES = ['name', 'size', 'extname', 'mimeType']

export class AttachmentManager {
  #logger: LoggerService
  #config: ResolvedAttachmentConfig
  #drive: DriveService

  constructor(config: ResolvedAttachmentConfig, logger: LoggerService, drive: DriveService) {
    this.#logger = logger
    this.#drive = drive
    this.#config = config
  }

  getConfig() {
    return this.#config
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

    return new Attachment(this.#drive, attributes)
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

    return new Attachment(this.#drive, attributes, file.tmpPath)
  }

  async createFromBuffer(buffer: Buffer, name?: string) {
    const attributes = await createAttachmentAttributes(buffer, name)

    return new Attachment(this.#drive, attributes, buffer)
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

  async computeUrl(attachment: AttachmentType) {
    if (attachment.options?.preComputeUrl === false) {
      return
    }

    const disk = attachment.getDisk()
    const fileVisibility = await disk.getVisibility(attachment.path!)

    if (fileVisibility === 'private') {
      attachment.url = await attachment.getSignedUrl()
    } else {
      attachment.url = await attachment.getUrl()
    }

    if (attachment.variants) {
      for (const key in attachment.variants) {
        if (Object.prototype.hasOwnProperty.call(attachment.variants, key)) {
          if (fileVisibility === 'private') {
            attachment.variants[key].url = await attachment.getSignedUrl(attachment.variants[key].key)
          } else {
            attachment.variants[key].url = await attachment.getUrl(attachment.variants[key].key)
          }
        }
      }
    }
  }

  async save(attachment: AttachmentBase) {
    const destinationPath = attachment.path!

    if (attachment.options?.meta) {
      attachment.meta = await exif(attachment.input!)
    } else {
      attachment.meta = undefined
    }

    try {
      if (Buffer.isBuffer(attachment.input)) {
        await attachment.getDisk().put(destinationPath, attachment.input)
      } else if (attachment.input) {
        await attachment.getDisk().copyFromFs(attachment.input, destinationPath)
      }
    } catch (err) {
      this.#logger.error({ err }, 'Error send file')
    }
  }

  async delete(attachment: AttachmentBase) {
    if (attachment.path) {
      try {
        const filePath = attachment.path

        try {
          await attachment.getDisk().delete(filePath)
        } catch (accessError) {
          if (accessError.code === 'ENOENT') {
            this.#logger.warn(`File not found: ${filePath}`)
          } else {
            throw accessError
          }
        }

        if (attachment instanceof Attachment) {
          if (attachment.variants) {
            const variantPath = attachment.variants[0].folder
            try {
              await attachment.getDisk().deleteAll(variantPath)
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
