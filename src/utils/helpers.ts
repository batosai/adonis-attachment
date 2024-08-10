/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentOptions } from '../types/attachment.js'
import type { Input } from '../types/input.js'
import type { ModelWithAttachment } from '../types/mixin.js'

import { cuid } from '@adonisjs/core/helpers'
import string from '@adonisjs/core/helpers/string'
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type'
import { Attachment } from '../attachments/attachment.js'
import { optionsSym } from './symbols.js'
import { exif } from '../adapters/exif.js'

export function getAttachmentAttributeNames(modelInstance: ModelWithAttachment) {
  return Object.keys(modelInstance.$attributes).filter(
    (attr) => modelInstance.$attributes[attr] instanceof Attachment
  )
}

export function getOptions(
  modelInstance: ModelWithAttachment,
  attributeName: string
): AttachmentOptions {
  return modelInstance.constructor.prototype[optionsSym]?.[attributeName]
}

export async function createAttachmentAttributes(input: Input, name?: string) {
  let fileType
  if (Buffer.isBuffer(input)) {
    fileType = await fileTypeFromBuffer(input)
  } else {
    fileType = await fileTypeFromFile(input)
  }

  const meta = await exif(input)

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
    meta: meta,
  }
}

export function cleanObject(obj: any) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  const cleanedObj: any = Array.isArray(obj) ? [] : {}

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const cleanedValue = cleanObject(obj[key])

      if (
        cleanedValue !== null &&
        cleanedValue !== undefined &&
        cleanedValue !== 0 &&
        cleanedValue !== ''
      ) {
        cleanedObj[key] = cleanedValue
      }
    }
  }

  return cleanedObj
}

export function clone(object: Object) {
  return JSON.parse(JSON.stringify(object))
}
