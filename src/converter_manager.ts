import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Converter, ConverterInitializeAttributes } from './types/converter.js'

import db from '@adonisjs/lucid/services/db'
import { Input } from './types/input.js'
import { ModelWithAttachment } from './types/mixin.js'
import attachmentManager from '../services/main.js'

export class ConverterManager {
  #key: string
  #input: Input
  #record: ModelWithAttachment
  #attributeName: string
  #converter: Converter

  constructor({ record, attributeName, key, converter }: ConverterInitializeAttributes) {
    this.#key = key
    this.#record = record
    this.#attributeName = attributeName

    this.#input = record.$attributes[attributeName].input

    this.#converter = converter
  }

  async save() {
    const record = this.#record!
    const attribute = this.#attributeName!

    await record.refresh()

    const output = await this.#converter.handle!({
      input: this.#input,
      options: this.#converter.options!,
    })

    const Model = record.constructor as LucidModel
    const id = record.$attributes['id']
    const attachment = record.$attributes[attribute]
    const data: any = {}

    const variant = await attachment.createVariant(this.#key, output)

    await attachmentManager.save(variant)

    data[attribute] = JSON.stringify(attachment.toObject())

    const trx = await db.transaction()

    trx.after('rollback', () => attachmentManager.delete(variant))

    try {
      await trx.query().from(Model.table).where('id', id).update(data)

      return await trx.commit()
    } catch (error) {
      return await trx.rollback()
    }
  }
}
