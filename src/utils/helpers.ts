/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentAttributes, LucidOptions } from '../types/attachment.js'
import type { Input } from '../types/input.js'
import type { ModelWithAttachment } from '../types/mixin.js'

import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import fs from 'node:fs/promises'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { createWriteStream, WriteStream } from 'node:fs'
import { cuid } from '@adonisjs/core/helpers'
import { Attachment } from '../attachments/attachment.js'
import * as errors from '../errors.js'
import { optionsSym } from './symbols.js'
import { meta, metaByFileName } from '../adapters/meta.js'

const streamPipeline = promisify(pipeline)

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

export async function createAttachmentAttributes(input: Input, name?: string): Promise<AttachmentAttributes> {
  const fileType = await meta(input)
  let originalName = name

  if (!name && !Buffer.isBuffer(input)) {
    originalName = path.basename(input)
  }
  else if (!name && Buffer.isBuffer(input)) {
    originalName = `${cuid()}.${fileType!.extname}`
  }

  return {
    originalName: originalName!,
    ...fileType
  }
}

export async function createAttachmentAttributesForUrl(input: Input, name: string): Promise<AttachmentAttributes> {
  const fileType = await metaByFileName(name)
  const stats = await fs.stat(input)

  return {
    originalName: name,
    size: stats.size,
    ...fileType
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

// TODO
// gestion des erreurs

export async function streamToTempFile(input: NodeJS.ReadableStream): Promise<string> {
  const folder = os.tmpdir()
  const tempFilePath = path.join(folder, `tempfile-${Date.now()}.tmp`)

  const writeStream: WriteStream = createWriteStream(tempFilePath)

  try {
    await streamPipeline(input, writeStream)
    return tempFilePath
  } catch (err) {
    throw new errors.E_CANNOT_GENERATE_TEMP_FILE([err.message])
  }
}

export async function downloadToTempFile(input: URL): Promise<string> {
  return await new Promise((resolve) => {
    https.get(input, (response) => {
      if (response.statusCode === 200) {
        resolve(streamToTempFile(response))
      } else {
        // reject(`${response.statusCode}`)
        throw new errors.E_CANNOT_GENERATE_TEMP_FILE([''])
      }
    }).on('error', (err) => {
      throw new errors.E_CANNOT_GENERATE_TEMP_FILE([err.message])
    })
  })
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
