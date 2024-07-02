/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentOptions } from '../types/attachment.js'
import type { Input } from '../types/input.js'
import type { ModelWithAttachment } from '../types/mixin.js'
import fs from 'node:fs/promises'
import { cuid } from '@adonisjs/core/helpers'
import string from '@adonisjs/core/helpers/string'
import { Attachment } from '../../services/attachment_service.js'
import { optionsSym } from './symbols.js'
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type'
import { exif } from '../adapters/exif.js'

export function getAttachmentTypeAttributes(modelInstance: ModelWithAttachment) {
  return Object.keys(modelInstance.$attributes).filter(
    (attr) => modelInstance.$attributes[attr] instanceof Attachment
  )
}

export function getOptions(modelInstance: ModelWithAttachment, property: string): AttachmentOptions {
  return modelInstance.constructor.prototype[optionsSym]?.[property]
}

export async function attachmentParams(input: Input, name?: string) {
  let fileType
  let meta
  if (Buffer.isBuffer(input)) {
    fileType = await fileTypeFromBuffer(input)
    meta = await exif(input)
  } else {
    fileType = await fileTypeFromFile(input)
    const buffer = await fs.readFile(input)
    meta = await exif(buffer)
  }

  if (name) {
    name = string.slug(name)
  } else {
    name = `${cuid()}.${fileType!.ext}`
  }

  return {
    originalName: name,
    extname: fileType!.ext,
    mimeType: fileType!.mime,
    size: input.length,
    meta
  }
}