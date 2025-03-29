/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'
import type { Input } from '../types/input.js'

import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type'
import Converter from './converter.js'
import ImageConverter from './image_converter.js'
import VideoThumnailConverter from './video_thumbnail_converter.js'

export default class AutodetectConverter extends Converter {
  async handle({ input, options }: ConverterAttributes): Promise<Input | undefined> {
    let converter
    let fileType

    if (Buffer.isBuffer(input)) {
      fileType = await fileTypeFromBuffer(input)
    } else {
      fileType = await fileTypeFromFile(input)
    }

    if (fileType?.mime.includes('video')) {
      converter = new VideoThumnailConverter(options, this.binPaths)
    } else {
      converter = new ImageConverter(options, this.binPaths)
    }

    return converter.handle({
      input,
      options,
    })
  }
}
