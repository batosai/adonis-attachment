/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'
import type { Input } from '../types/input.js'

import Converter from './converter.js'
import ImageConverter from './image_converter.js'
import { bufferToTempFile } from '../utils/helpers.js'
import FFmpeg from '../adapters/ffmpeg.js'

export default class VideoThumbnailConvert extends Converter {
  async handle({ input, options }: ConverterAttributes): Promise<Input | undefined> {
    const filePath = await this.videoToImage(input)

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

  async videoToImage(input: Input) {
    let file = input

    if (Buffer.isBuffer(input)) {
      file = await bufferToTempFile(input)
    }

    const ffmpeg = new FFmpeg(file as string)

    if (this.binPaths) {
      if (this.binPaths.ffmpegPath) {
        ffmpeg.setFfmpegPath(this.binPaths.ffmpegPath)
      }
    }

    return ffmpeg.screenshots({
      time: 2,
    })
  }
}
