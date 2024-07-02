/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { BaseConverter as Base, ConverterAttributes, ConverterInitializeAttributes, ConverterOptions } from '../types/converter.js'
import type { ModelWithAttachment } from '../types/mixin.js'
import { LucidModel } from '@adonisjs/lucid/types/model'
import db from '@adonisjs/lucid/services/db'
import attachmentManager from '../../services/main.js'
import type { Input } from '../types/input.js'
export default class BaseConverter implements Base {
  #key?: string
  #input?: Input
  #options?: ConverterOptions
  #record?: ModelWithAttachment
  #attribute?: string

  constructor(options?: ConverterOptions) {
    this.#options = options
  }

  async initialize({ record, attribute, key }: ConverterInitializeAttributes) {
    this.#key = key
    this.#record = record
    this.#attribute = attribute

    const input = record.$attributes[attribute].input

    if (typeof this.handle === 'function') {
      this.#input = await this.handle({
        key: this.#key!,
        input,
        options: this.#options!
      })

      this.save()
    }
  }

  async handle(attributes: ConverterAttributes): Promise<Input | undefined> {
    console.log(attributes)
    return undefined
  }

  async save() {
    const record = this.#record!
    const attribute = this.#attribute!

    await record.refresh()

    const Model = record.constructor as LucidModel
    const id = record.$attributes['id']
    const attachment = record.$attributes[attribute]
    const data: any = {}

    const variant = await attachment.createVariant(this.#key, this.#input)
    
    data[attribute] = JSON.stringify(attachment.toObject())

    const trx = await db.transaction()

    trx.after('commit', () => attachmentManager.save(variant))
    trx.after('rollback', () => attachmentManager.delete(variant))

    try {
      await trx
        .query()
        .from(Model.table)
        .where('id', id)
        .update(data)
    
      return await trx.commit()
    } catch (error) {
      return await trx.rollback()
    }
  }
}
