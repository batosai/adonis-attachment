/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'

import os from 'node:os'
import path from 'node:path'
import { cuid } from '@adonisjs/core/helpers'
import Converter from './converter.js'
import ImageConverter from './image_converter.js'
import { Input } from '../types/input.js'
import { use } from '../utils/helpers.js'

export default class VideoThumbnailConvert extends Converter {

  async handle({ input, options }: ConverterAttributes) {
    const ffmpeg = await use('fluent-ffmpeg')

    if (ffmpeg) {
      const filePath = await this.videoToImage(ffmpeg, input)

      if (options && filePath) {
        const converter = new ImageConverter()
        return await converter.handle({
          input: filePath,
          options
        })
      } else {
        return filePath
      }
    }
  }

  async videoToImage(ffmpeg: Function, input: Input) {
    return new Promise<string|false>((resolve) => {
      const folder = os.tmpdir()
      const filename = `${cuid()}.png`

      const ff = ffmpeg(input)

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
      })
  }
}
