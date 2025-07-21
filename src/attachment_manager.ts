/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { DriveService, SignedURLOptions } from '@adonisjs/drive/types'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type { LockService } from './types/lock.js'
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
  #lock: LockService

  constructor(config: ResolvedAttachmentConfig<KnownConverters>, drive: DriveService, lock: LockService) {
    this.#drive = drive
    this.#lock = lock
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

  async computeUrl(
    attachment: AttachmentType | AttachmentBase,
    signedUrlOptions?: SignedURLOptions
  ) {
    await attachment.computeUrl(signedUrlOptions)
  }

  async preComputeUrl(attachment: AttachmentType) {
    await attachment.preComputeUrl()
  }

  async write(attachment: AttachmentBase) {
    if (attachment.options?.meta) {
      attachment.meta = await ExifAdapter.exif(attachment.input!, this.#config)
    } else {
      attachment.meta = undefined
    }

    await attachment.put()
  }

  async remove(attachment: AttachmentBase) {
    await attachment.remove()
  }

  // getters

  get lock() {
    return this.#lock
  }

  getConfig() {
    return this.#config
  }

  async getConverter(key: string): Promise<void | Converter> {
    if (this.#config.converters) {
      return this.#config.converters[key]
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
