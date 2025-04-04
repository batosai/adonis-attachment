/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'
import type { Input } from '../types/input.js'

import os from 'node:os'
import path from 'node:path'
import { cuid } from '@adonisjs/core/helpers'
import Converter from './converter.js'
import ImageConverter from './image_converter.js'
import { bufferToTempFile, use } from '../utils/helpers.js'

export default class VideoThumbnailConvert extends Converter {
  async handle({ input, options }: ConverterAttributes): Promise<Input | undefined> {
    const ffmpeg = await use('fluent-ffmpeg')
    const filePath = await this.videoToImage(ffmpeg, input)

    if (options && filePath) {
      const converter = new ImageConverter()
      return converter.handle({
        input: filePath,
        options,
      })
    } else {
      return filePath
    }
  }

  async videoToImage(ffmpeg: Function, input: Input) {
    let file = input

    if (Buffer.isBuffer(input)) {
      file = await bufferToTempFile(input)
    }

    return new Promise<string | undefined>((resolve, reject) => {
      const folder = os.tmpdir()
      const filename = `${cuid()}.png`

      const ff = ffmpeg(file)

      if (this.binPaths) {
        if (this.binPaths.ffmpegPath) {
          ff.setFfmpegPath(this.binPaths.ffmpegPath)
        }
      }

      ff.screenshots({
        count: 1,
        filename,
        folder,
      })
        .on('end', () => {
          resolve(path.join(folder, filename))
        })
        .on('error', (err: Error) => {
          reject(err)
        })
    })
  }
}
