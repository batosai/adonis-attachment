/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'

import Converter from './converter.js'
import { use } from '../utils/helpers.js'

export default class ImageConverter extends Converter {
  async handle({ input, options }: ConverterAttributes) {
    const sharp = await use('sharp')

    if (sharp) {
      const resize = options?.resize || {}
      let format = options?.format || 'webp'
      let formatoptions = {}

      if (typeof format !== 'string') {
        formatoptions = format?.options
        format = format.format
      }

      const buffer = await sharp(input)
        .withMetadata()
        .resize(resize)
        .toFormat(format, formatoptions)
        .toBuffer()

      return buffer
    }
  }
}
