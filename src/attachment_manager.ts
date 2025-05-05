/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { DriveService, SignedURLOptions } from '@adonisjs/drive/types'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type {
  AttachmentAttributes,
  AttachmentBase,
  Attachment as AttachmentType,
} from './types/attachment.js'
import type { ResolvedAttachmentConfig } from './define_config.js'

import path from 'node:path'
import { DeferQueue } from '@poppinss/defer'
import * as errors from './errors.js'
import { Attachment } from './attachments/attachment.js'
import Converter from './converters/converter.js'
import { downloadToTempFile, isBase64, streamToTempFile } from './utils/helpers.js'
import ExifAdapter from './adapters/exif.js'
import { metaFormBuffer, metaFormFile } from './adapters/meta.js'
import { cuid } from '@adonisjs/core/helpers'

const REQUIRED_ATTRIBUTES = ['name', 'size', 'extname', 'mimeType'] as const;

export class AttachmentManager<KnownConverters extends Record<string, Converter>> {
  queue
  #config: ResolvedAttachmentConfig<KnownConverters>
  #drive: DriveService

  constructor(config: ResolvedAttachmentConfig<KnownConverters>, drive: DriveService) {
    this.#drive = drive
    this.#config = config

    const concurrency = this.#config.queue?.concurrency || 1

    this.queue = new DeferQueue({ concurrency })
  }

  createFromDbResponse(response?: string | JSON) {
    if (response === null) {
      return null
    }

    const attributes = typeof response === 'string' ? JSON.parse(response) : response

    REQUIRED_ATTRIBUTES.forEach((attribute) => {
      if (attributes[attribute] === undefined) {
        throw new errors.E_CANNOT_CREATE_ATTACHMENT([attribute])
      }
    })

    const attachment = new Attachment(this.#drive, attributes)
    return this.#configureAttachment(attachment)
  }

  async createFromFile(input: MultipartFile) {
    const attributes = {
      originalName: input.clientName,
      extname: input.extname || '',
      mimeType: input.type && input.subtype ? `${input.type}/${input.subtype}` : '',
      size: input.size!,
    }

    if (!input.tmpPath) {
      throw new errors.ENOENT()
    }

    const attachment = new Attachment(this.#drive, attributes, input.tmpPath)
    return this.#configureAttachment(attachment)
  }

  async createFromFiles(inputs: MultipartFile[]) {
    return Promise.all(inputs.map((input) => this.createFromFile(input)))
  }

  async createFromPath(input: string, name?: string) {
    const meta = await metaFormFile(input, name || input)

    if (meta.extname === '') {
      meta.extname = 'tmp'
      meta.mimeType = 'application/x-temp'
    }

    const attributes: AttachmentAttributes = {
      ...meta,
      originalName: name?.replace('tmp', meta.extname) || path.basename(input),
    }

    const attachment = new Attachment(this.#drive, attributes, input)
    return this.#configureAttachment(attachment)
  }

  async createFromBuffer(input: Buffer, name?: string) {
    if (!Buffer.isBuffer(input)) {
      throw new errors.E_ISNOT_BUFFER()
    }

    const meta = await metaFormBuffer(input)
    const ext = meta.extname || 'tmp'
    const attributes: AttachmentAttributes = {
      ...meta,
      originalName: name || `${cuid()}.${ext}`,
    }

    const attachment = new Attachment(this.#drive, attributes, input)
    return this.#configureAttachment(attachment)
  }

  async createFromBase64(input: string, name?: string) {
    const base64Data = input.replace(/^data:([A-Za-z-+\/]+);base64,/, '')
    if (!isBase64(base64Data)) {
      throw new errors.E_ISNOT_BASE64()
    }

    const buffer = Buffer.from(base64Data, 'base64')

    return this.createFromBuffer(buffer, name)
  }

  async createFromUrl(input: URL, name?: string) {
    const tmpPath = await downloadToTempFile(input)

    return this.createFromPath(tmpPath, name || path.basename(input.pathname))
  }

  async createFromStream(stream: NodeJS.ReadableStream, name?: string) {
    const tmpPath = await streamToTempFile(stream)

    return this.createFromPath(tmpPath, name || path.basename(tmpPath))
  }

  async getConverter(key: string): Promise<void | Converter> {
    if (this.#config.converters) {
      return this.#config.converters[key]
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

  async write(attachment: AttachmentBase) {
    const destinationPath = attachment.path!

    if (attachment.options?.meta) {
      attachment.meta = await ExifAdapter.exif(attachment.input!, this.#config)
    } else {
      attachment.meta = undefined
    }

    if (Buffer.isBuffer(attachment.input)) {
      await attachment.getDisk().put(destinationPath, attachment.input)
    } else if (attachment.input) {
      await attachment.getDisk().copyFromFs(attachment.input, destinationPath)
    }
  }

  async remove(attachment: AttachmentBase) {
    if (attachment.path) {
      await attachment.getDisk().delete(attachment.path)

      if (attachment instanceof Attachment) {
        if (attachment.variants) {
          const variantPath = attachment.variants[0].folder
          await attachment.getDisk().deleteAll(variantPath) // not compatible Minio, necessary for fs as not to leave an empty directory

          for (const key in attachment.variants) {
            if (Object.prototype.hasOwnProperty.call(attachment.variants, key)) {
              await attachment.getDisk().delete(attachment.variants[key].path)
            }
          }
        }
      }
    }

    if (attachment.originalPath) {
      await attachment.getDisk().delete(attachment.originalPath)
    }
  }

  // private methods

  #configureAttachment(attachment: AttachmentType) {
    if (this.#config.meta !== undefined) {
      attachment.setOptions({ meta: this.#config.meta })
    }

    if (this.#config.rename !== undefined) {
      attachment.setOptions({ rename: this.#config.rename })
    }

    if (this.#config.preComputeUrl !== undefined) {
      attachment.setOptions({ preComputeUrl: this.#config.preComputeUrl })
    }

    return attachment
  }
}
