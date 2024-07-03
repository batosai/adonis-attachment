/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'
import type {
  Converter as ConverterInterface,
  ConverterAttributes,
  ConverterInitializeAttributes,
  ConverterOptions,
} from '../types/converter.js'
import type { ModelWithAttachment } from '../types/mixin.js'
import type { Input } from '../types/input.js'

import db from '@adonisjs/lucid/services/db'
import { RuntimeException } from '@poppinss/utils'
import attachmentManager from '../../services/main.js'
export default class Converter implements ConverterInterface {
  #key?: string
  #input?: Input
  #options?: ConverterOptions
  #record?: ModelWithAttachment
  #attributeName?: string

  constructor(options?: ConverterOptions) {
    this.#options = options
  }

  async initialize({ record, attributeName, key }: ConverterInitializeAttributes) {
    this.#key = key
    this.#record = record
    this.#attributeName = attributeName

    const input = record.$attributes[attributeName].input

    if (typeof this.handle === 'function') {
      this.#input = await this.handle({
        key: this.#key!,
        input,
        options: this.#options!,
      })

      this.save()
    }
  }

  async handle(attributes: ConverterAttributes): Promise<Input | undefined> {
    console.log(attributes)
    throw new RuntimeException('Invalid converter. Missing handle method')
  }

  async save() {
    const record = this.#record!
    const attribute = this.#attributeName!

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
      await trx.query().from(Model.table).where('id', id).update(data)

      return await trx.commit()
    } catch (error) {
      return await trx.rollback()
    }
  }
}
