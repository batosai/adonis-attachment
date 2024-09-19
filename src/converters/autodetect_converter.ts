/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'

import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type'
import Converter from './converter.js'
import ImageConverter from './image_converter.js'
import VideoThumnailConverter from './video_thumbnail_converter.js'

export default class AutodetectConverter extends Converter {
  async handle({ input, options }: ConverterAttributes) {
    let converter
    let fileType

    if (Buffer.isBuffer(input)) {
      fileType = await fileTypeFromBuffer(input)
    } else {
      fileType = await fileTypeFromFile(input)
    }

    if (fileType?.mime.includes('image')) {
      converter = new ImageConverter(options, this.binPaths)
    } else if (fileType?.mime.includes('video')) {
      converter = new VideoThumnailConverter(options, this.binPaths)
    }

    if (converter) {
      return await converter.handle({
        input,
        options,
      })
    }
  }
}
