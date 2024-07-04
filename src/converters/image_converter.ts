/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'

import logger from '@adonisjs/core/services/logger'
import Converter from './converter.js'

export default class ImageConverter extends Converter {
  async handle({ input, options }: ConverterAttributes) {
    let sharp
    try {
      const module = 'sharp'
      const result = await import(module)
      sharp = result.default
    } catch (error) {
      logger.error({ err: error }, 'Dependence missing, please install sharp')
    }

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
