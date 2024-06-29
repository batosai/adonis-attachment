/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { BaseConverter as Base, ConverterAttributes, ConverterOptions, ModelWithAttachment } from '../types.js'

export default class BaseConverter implements Base {
  buffer?: Buffer
  options?: ConverterOptions
  record?: ModelWithAttachment
  attribute?: string

  constructor(options?: ConverterOptions) {
    this.options = options
  }

  handle({ record, attribute }: ConverterAttributes) {
    this.record = record
    this.attribute = attribute

    this.buffer = record.$attributes[attribute].buffer
  }

  save() {
    // record.attachments.attached du coup attribute non utile ?
    // TODO: utiliser le manager et createFromBuffer
    // set torecord.attachments.attached[i].addVariant(...)
  }
}
