/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'
import type { Input } from '../types/input.js'

import Converter from './converter.js'
import { use } from '../utils/helpers.js'

export default class ImageConverter extends Converter {
  async handle({ input, options }: ConverterAttributes): Promise<Input> {
    const sharp = await use('sharp')
    const resize = options?.resize || {}
    let format = options?.format || 'webp'
    const autoOrient = options?.autoOrient ?? true
    let formatoptions = {}

    if (typeof format !== 'string') {
      formatoptions = format?.options
      format = format.format
    }

    const image = sharp(input)
      .withMetadata()

    if (autoOrient) {
      image.autoOrient()
    }

    const buffer: Input = await image
      .resize(resize)
      .toFormat(format, formatoptions)
      .toBuffer()

    return buffer
  }
}
