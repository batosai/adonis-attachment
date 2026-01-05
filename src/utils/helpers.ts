/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Input } from '../types/input.js'
import type { BlurhashOptions } from '../types/converter.js'

import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import fs from 'node:fs/promises'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { createWriteStream, WriteStream } from 'node:fs'
import BlurhashAdapter from '../adapters/blurhash.js'
import * as errors from '../errors.js'

const streamPipeline = promisify(pipeline)

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
    https
      .get(input, (response) => {
        if (response.statusCode === 200) {
          resolve(streamToTempFile(response))
        } else {
          // reject(`${response.statusCode}`)
          throw new errors.E_CANNOT_GENERATE_TEMP_FILE([''])
        }
      })
      .on('error', (err) => {
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

export function imageToBlurhash(input: Input, options?: BlurhashOptions): Promise<string> {
  const { componentX, componentY } = options || { componentX: 4, componentY: 4 }

  return new Promise(async (resolve, reject) => {
    try {
      const sharp = await use('sharp')
      // Convert input to pixels
      const { data: pixels, info: metadata } = await sharp(input)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })

      const blurhash = BlurhashAdapter.encode(
        new Uint8ClampedArray(pixels),
        metadata.width,
        metadata.height,
        componentX,
        componentY
      )

      return resolve(blurhash)
    } catch (error) {
      return reject(error)
    }
  })
}

export function extractPathParameters(path: string): string[] {
  const paramRegex = /:(\w+)/g
  const parameters: string[] = []
  let match

  while ((match = paramRegex.exec(path)) !== null) {
    parameters.push(match[1])
  }

  return parameters
}

export function secondsToTimeFormat(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}
