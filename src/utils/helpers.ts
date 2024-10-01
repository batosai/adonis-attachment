/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidOptions } from '../types/attachment.js'
import type { Input } from '../types/input.js'
import type { ModelWithAttachment } from '../types/mixin.js'

import os from 'node:os'
import path from 'node:path'
import fs from 'fs/promises'
import { cuid } from '@adonisjs/core/helpers'
import string from '@adonisjs/core/helpers/string'
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type'
import { Attachment } from '../attachments/attachment.js'
import * as errors from '../errors.js'
import { optionsSym } from './symbols.js'

export function getAttachmentAttributeNames(modelInstance: ModelWithAttachment) {
  return Object.keys(modelInstance.$attributes).filter(
    (attr) => modelInstance.$attributes[attr] instanceof Attachment
  )
}

export function getDirtyAttachmentAttributeNames(modelInstance: ModelWithAttachment) {
  return Object.keys(modelInstance.$dirty).filter(
    (attr) =>
      modelInstance.$dirty[attr] instanceof Attachment ||
      modelInstance.$original[attr] instanceof Attachment
  )
}

export function getOptions(
  modelInstance: ModelWithAttachment,
  attributeName: string
): LucidOptions {
  return modelInstance.constructor.prototype[optionsSym]?.[attributeName]
}

export async function createAttachmentAttributes(input: Input, name?: string) {
  let fileType
  if (Buffer.isBuffer(input)) {
    fileType = await fileTypeFromBuffer(input)
  } else {
    fileType = await fileTypeFromFile(input)
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

export async function use(module: string) {
  try {
    const result = await import(module)

    if (result.default) {
      return result.default
    }

    return result
  } catch (err) {
    throw new errors.E_MISSING_PACKAGE([module], { cause: err })
  }
}

export async function bufferToTempFile(input: Buffer) {
  const folder = os.tmpdir()
  const tempFilePath = path.join(folder, `tempfile-${Date.now()}.tmp`)
  await fs.writeFile(tempFilePath, input)
  return tempFilePath
}

export function isBase64(str: string) {
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

  if (!base64Regex.test(str)) {
    return false
  }

  try {
    Buffer.from(str, 'base64').toString()
    return true
  } catch (err) {
    return false
  }
}
