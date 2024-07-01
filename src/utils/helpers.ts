/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentOptions, ModelWithAttachment } from '../types.js'
import { cuid } from '@adonisjs/core/helpers'
import string from '@adonisjs/core/helpers/string'
import { Attachment } from '../../services/attachment_service.js'
import { optionsSym } from './symbols.js'
import { fileTypeFromBuffer } from 'file-type'
import { exif } from '../adapters/exif.js'

export function getAttachmentTypeAttributes(modelInstance: ModelWithAttachment) {
  return Object.keys(modelInstance.$attributes).filter(
    (attr) => modelInstance.$attributes[attr] instanceof Attachment
  )
}

export function getOptions(modelInstance: ModelWithAttachment, property: string): AttachmentOptions {
  return modelInstance.constructor.prototype[optionsSym]?.[property]
}

export async function attachmentParams(buffer: Buffer, name?: string) {
  const fileType = await fileTypeFromBuffer(buffer)
  const meta = await exif(buffer)

  if (name) {
    name = string.slug(name)
  } else {
    name = `${cuid()}.${fileType!.ext}`
  }

  return {
    originalName: name,
    extname: fileType!.ext,
    mimeType: fileType!.mime,
    size: buffer.length,
    meta
  }
}