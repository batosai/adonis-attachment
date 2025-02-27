import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Converter, ConverterInitializeAttributes } from './types/converter.js'
import type { Attachment } from './types/attachment.js'

import string from '@adonisjs/core/helpers/string'
import db from '@adonisjs/lucid/services/db'
import { ModelWithAttachment } from './types/mixin.js'
import attachmentManager from '../services/main.js'
import * as errors from './errors.js'
import { getOptions } from './utils/helpers.js'

export class ConverterManager {
  #record: ModelWithAttachment
  #attributeName: string

  constructor({ record, attributeName }: ConverterInitializeAttributes) {
    this.#record = record
    this.#attributeName = attributeName
  }

  async save() {
    const options = getOptions(this.#record, this.#attributeName)
    const attachment = this.#record.$attributes[this.#attributeName] as Attachment
    const input = attachment.input!
    const Model = this.#record.constructor as LucidModel
    const id = this.#record.$attributes['id']
    const data: any = {}

    if (options.variants) {
      for (const option of options.variants) {
        const converter = (await attachmentManager.getConverter(option)) as Converter

        if (attachment && converter) {
          const output = await converter.handle!({
            input,
            options: converter.options!,
          })

          if (output === undefined) {
            throw new errors.E_CANNOT_PATH_BY_CONVERTER()
          }

          const variant = await attachment.createVariant(option, output)
          await attachmentManager.save(variant)
        }
      }
    }

    data[string.snakeCase(this.#attributeName)] = JSON.stringify(attachment.toObject())

    const trx = await db.transaction()

    trx.after('rollback', () => {
      for (const variant of attachment.variants!) {
        attachmentManager.delete(variant)
      }
    })

    try {
      await trx.query().from(Model.table).where('id', id).update(data)

      return await trx.commit()
    } catch (error) {
      return await trx.rollback()
    }
  }
}
