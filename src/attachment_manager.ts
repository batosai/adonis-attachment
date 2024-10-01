/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { DriveService, SignedURLOptions } from '@adonisjs/drive/types'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type { AttachmentBase, Attachment as AttachmentType } from './types/attachment.js'
import type { ResolvedAttachmentConfig } from './types/config.js'

import * as errors from './errors.js'
import { Attachment } from './attachments/attachment.js'
import Converter from './converters/converter.js'
import { createAttachmentAttributes, isBase64 } from './utils/helpers.js'
import { exif } from './adapters/exif.js'

const REQUIRED_ATTRIBUTES = ['name', 'size', 'extname', 'mimeType']

export class AttachmentManager {
  #config: ResolvedAttachmentConfig
  #drive: DriveService

  constructor(config: ResolvedAttachmentConfig, drive: DriveService) {
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
        throw new errors.E_CANNOT_CREATE_ATTACHMENT([attribute])
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
      throw new errors.ENOENT()
    }

    return new Attachment(this.#drive, attributes, file.tmpPath)
  }

  async createFromBuffer(buffer: Buffer, name?: string) {
    if (!Buffer.isBuffer(buffer)) {
      throw new errors.E_ISNOT_BUFFER()
    }

    const attributes = await createAttachmentAttributes(buffer, name)

    return new Attachment(this.#drive, attributes, buffer)
  }

  async createFromBase64(data: string, name?: string) {
    const base64Data = data.replace(/^data:([A-Za-z-+\/]+);base64,/, '')
    if (!isBase64(base64Data)) {
      throw new errors.E_ISNOT_BASE64()
    }

    const buffer = Buffer.from(base64Data, 'base64')

    return await this.createFromBuffer(buffer, name)
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

  async computeUrl(
    attachment: AttachmentType | AttachmentBase,
    signedUrlOptions?: SignedURLOptions
  ) {
    const disk = attachment.getDisk()
    const fileVisibility = await disk.getVisibility(attachment.path!)

    if (fileVisibility === 'private') {
      attachment.url = await attachment.getSignedUrl(signedUrlOptions)
    } else {
      attachment.url = await attachment.getUrl()
    }
  }

  async preComputeUrl(attachment: AttachmentType) {
    if (attachment.options?.preComputeUrl === false) {
      return
    }

    await this.computeUrl(attachment)

    if (attachment instanceof Attachment && attachment.variants) {
      for (const key in attachment.variants) {
        if (Object.prototype.hasOwnProperty.call(attachment.variants, key)) {
          await this.computeUrl(attachment.variants[key])
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

    if (Buffer.isBuffer(attachment.input)) {
      await attachment.getDisk().put(destinationPath, attachment.input)
    } else if (attachment.input) {
      await attachment.getDisk().copyFromFs(attachment.input, destinationPath)
    }
  }

  async delete(attachment: AttachmentBase) {
    if (attachment.path) {
      const filePath = attachment.path

      await attachment.getDisk().delete(filePath)

      if (attachment instanceof Attachment) {
        if (attachment.variants) {
          const variantPath = attachment.variants[0].folder
          await attachment.getDisk().deleteAll(variantPath)
        }
      }
    }
  }
}
