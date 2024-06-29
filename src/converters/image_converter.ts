/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { cuid } from '@adonisjs/core/helpers'
import { Variant } from '../../services/attachment_variant_service.js'
import { exif } from '../adapters/exif.js'
import type { ConverterAttributes } from '../types.js'
import BaseConverter from './base_converter.js'
import logger from '@adonisjs/core/services/logger'

export default class ImageConverter extends BaseConverter {
  async handle({ record, attribute }: ConverterAttributes) {
    super.handle({ record, attribute })

    let sharp
    try {
      const module = 'sharp'
      const result = await import(module)
      sharp = result.default
    } catch (error) {
      logger.error({ err: error }, 'Dependence missing, please install sharp')
    }

    if (sharp) {
      const resize = this.options?.resize || {}
      let format = this.options?.format || 'webp'
      let formatoptions = {}

      if (typeof format !== 'string') {
        formatoptions = format?.options
        format = format.format
      }

      const buffer = await sharp(this.buffer)
      .withMetadata()
      .resize(resize)
      .toFormat(format, formatoptions)
      .toBuffer()

      const meta = await exif(buffer)
      console.log(meta)
      const variant = new Variant('test', {
        name: `${cuid()}.${format}`,
        path: '',
        size: buffer.length,
        extname: format,
        mimeType: `image/${format}`,
        meta: meta
      })

      await record.refresh()

      const attachment = record.$attributes[attribute]
      attachment.addVariant(variant)
      record.$attributes[attribute] = attachment

      // record.$dirty = record
      // record.$isDirty = true

      record.save()

      await record.refresh()
      console.log(record)
    }
  }
}
