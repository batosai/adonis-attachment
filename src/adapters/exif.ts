/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Exif, Input } from '../types/input.js'
import type { Converter } from '../types/converter.js'

import fs from 'node:fs/promises'
import ExifReader from 'exifreader'
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type'
import { bufferToTempFile, cleanObject } from '../utils/helpers.js'
import { ResolvedAttachmentConfig } from '../define_config.js'

type KnownConverters = Record<string, Converter>

export default {
  async exif(
    input: Input,
    config: ResolvedAttachmentConfig<KnownConverters>
  ): Promise<Exif | undefined> {
    return exif(input, config)
  },
}

const exif = async (
  input: Input,
  config: ResolvedAttachmentConfig<KnownConverters>
): Promise<Exif | undefined> => {
  let fileType
  let buffer

  if (Buffer.isBuffer(input)) {
    fileType = await fileTypeFromBuffer(input)

    if (fileType?.mime.includes('image')) {
      buffer = input
    }
  } else {
    fileType = await fileTypeFromFile(input)

    if (fileType?.mime.includes('image')) {
      buffer = await fs.readFile(input)
    }
  }

  if (fileType?.mime.includes('video')) {
    return videoExif(input, config)
  }

  if (fileType?.mime.includes('pdf')) {
    return pdfExif(input, config)
  }

  if (buffer && fileType?.mime.includes('image')) {
    return imageExif(buffer)
  }

  return undefined
}

async function imageExif(buffer: Buffer) {
  const tags = await ExifReader.load(buffer, { expanded: true })
  const data: Exif = {}

  if (tags.exif) {
    if (tags.exif['DateTime']) data.date = tags.exif['DateTime'].description
    if (tags.exif['Software']) data.host = tags.exif['Software'].description

    if (tags.exif['PixelXDimension'] && tags.exif['PixelYDimension']) {
      data.dimension = {
        width: tags.exif['PixelXDimension'].value,
        height: tags.exif['PixelYDimension'].value,
      }
    }

    if (tags.exif['Orientation']) {
      data.orientation = {
        value: tags.exif['Orientation'].value,
        description: tags.exif['Orientation'].description,
      }
    }
  }

  if (tags.gps) {
    data.gps = {
      latitude: tags.gps['Latitude'],
      longitude: tags.gps['Longitude'],
      altitude: tags.gps['Altitude'],
    }
  }

  if (tags.png) {
    if (tags.png['Image Width'] && tags.png['Image Height']) {
      data.dimension = {
        width: tags.png['Image Width'].value,
        height: tags.png['Image Height'].value,
      }
    }
    if (tags.png['Software']) data.host = tags.png['Software'].description
    if (tags.png['Creation Time']) data.date = tags.png['Creation Time'].description
  }

  if (tags.pngFile) {
    if (tags.pngFile['Image Width'] && tags.pngFile['Image Height']) {
      data.dimension = {
        width: tags.pngFile['Image Width'].value,
        height: tags.pngFile['Image Height'].value,
      }
    }
  }

  if (tags.file) {
    if (tags.file['Image Width'] && tags.file['Image Height']) {
      data.dimension = {
        width: tags.file['Image Width'].value,
        height: tags.file['Image Height'].value,
      }
    }
  }

  if (tags.icc) {
    if (tags.icc['Software']) data.host = tags.icc['Software'].description
    if (tags.icc['Creation Time']) data.date = tags.icc['Creation Time'].description

    if (tags.icc['Image Width'] && tags.icc['Image Height']) {
      data.dimension = {
        width: parseInt(tags.icc['Image Width'].value),
        height: parseInt(tags.icc['Image Height'].value),
      }
    }
  }

  return cleanObject(data)
}

async function videoExif(input: Input, config: ResolvedAttachmentConfig<KnownConverters>) {
  const { default: FFmpeg } = await import('./ffmpeg.js')

  return new Promise<Exif | undefined>(async (resolve) => {
    let file = input
    if (Buffer.isBuffer(input)) {
      file = await bufferToTempFile(input)
    }

    const ffmpeg = new FFmpeg(file as string)

    if (config.bin) {
      if (config.bin.ffprobePath) {
        ffmpeg.setFfprobePath(config.bin.ffprobePath)
      }
    }

    const info = await ffmpeg.exif()

    if (info.width && info.height && info.duration) {
      resolve({
        dimension: {
          width: info.width,
          height: info.height,
        },
        duration: info.duration,
        videoCodec: info?.videoCodec,
        audioCodec: info?.audioCodec,
      })
    }
  })
}

async function pdfExif(input: Input, config: ResolvedAttachmentConfig<KnownConverters>) {
  const { default: Poppler } = await import('./poppler.js')
  return new Promise<Exif | undefined>(async (resolve) => {
    let file = input
    if (Buffer.isBuffer(input)) {
      file = await bufferToTempFile(input)
    }

    const poppler = new Poppler(file as string)

    if (config.bin) {
      if (config.bin.pdfinfoPath) {
        poppler.setPdfInfoPath(config.bin.pdfinfoPath)
      }
    }

    const info = await poppler.pdfInfo()

    if (info.width && info.height && info.pages) {
      resolve({
        dimension: {
          width: info.width,
          height: info.height,
        },
        version: info?.version,
        pages: info?.pages,
        date: info?.creationDate,
      })
    }
  })
}
