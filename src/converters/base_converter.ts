/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { BaseConverter as Base, ConverterAttributes, ConverterInitializeAttributes, ConverterOptions, ModelWithAttachment, Variant } from '../types.js'
import { LucidModel } from '@adonisjs/lucid/types/model'
import db from '@adonisjs/lucid/services/db'
export default class BaseConverter implements Base {
  #key?: string
  #buffer?: Buffer
  #options?: ConverterOptions
  #record?: ModelWithAttachment
  #attribute?: string
  #variant?: Variant

  constructor(options?: ConverterOptions) {
    this.#options = options
  }

  async initialize({ record, attribute, key }: ConverterInitializeAttributes) {
    this.#key = key
    this.#record = record
    this.#attribute = attribute

    this.#buffer = record.$attributes[attribute].buffer

    if (typeof this.handle === 'function') {
      this.#variant = await this.handle({
        key: this.#key!,
        buffer: this.#buffer!,
        options: this.#options!
      })
    }

    this.save()
  }

  async handle(attributes: ConverterAttributes): Promise<Variant | undefined> {
    console.log(attributes)
    return undefined
  }

  async save() {
    const record = this.#record!
    const variant = this.#variant!
    const attribute = this.#attribute!

    await record.refresh()

    const Model = record.constructor as LucidModel
    const id = record.$attributes['id']
    const attachment = record.$attributes[attribute]
    const data: any = {}

    attachment.addVariant(variant)
    
    data[attribute] = JSON.stringify(attachment.toObject())

    // TODO trx https://lucid.adonisjs.com/docs/transactions
    // storage

    return db
      .from(Model.table)
      .where('id', id)
      .update(data)
  }
}
