/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import attachmentManager from '../../services/main.js'
import type { ConverterAttributes } from '../types.js'
import BaseConverter from './base_converter.js'
import logger from '@adonisjs/core/services/logger'

export default class ImageConverter extends BaseConverter {
  async handle({ key, buffer, options }: ConverterAttributes) {
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

      const newBuffer = await sharp(buffer)
      .withMetadata()
      .resize(resize)
      .toFormat(format, formatoptions)
      .toBuffer()

      return await attachmentManager.createVariant(newBuffer, key)
    }
  }
}
