import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Converter, ConverterInitializeAttributes } from './types/converter.js'
import type { Attachment, LucidOptions } from './types/attachment.js'
import type { Record } from './types/service.js'

import logger from '@adonisjs/core/services/logger'
import string from '@adonisjs/core/helpers/string'
import db from '@adonisjs/lucid/services/db'
import attachmentManager from '../services/main.js'
import * as errors from './errors.js'
import { encodeImageToBlurhash } from './utils/helpers.js'

export class ConverterManager {
  #record: Record
  #attributeName: string
  #options: LucidOptions

  constructor({ record, attributeName, options }: ConverterInitializeAttributes) {
    this.#record = record
    this.#attributeName = attributeName
    this.#options = options
  }

  async save() {
    let attachments: Attachment[] = this.#record.getAttachments({
      attributeName: this.#attributeName,
    })

    const Model = this.#record.model.constructor as LucidModel
    const id = this.#record.model.$attributes['id']
    const data: any = {}

    if (this.#options.variants) {
      for (const option of this.#options.variants) {
        const converter = (await attachmentManager.getConverter(option)) as Converter

        if (attachments && converter) {
          for (let i = 0; i < attachments.length; i++) {
            const input = attachments[i].input!
            const output = await converter.handle!({
              input,
              options: converter.options!,
            })

            if (output === undefined) {
              throw new errors.E_CANNOT_PATH_BY_CONVERTER()
            }

            const variant = await attachments[i].createVariant(option, output)

            if (converter.options!.blurhash) {
              try {
                const options = typeof converter.options!.blurhash !== 'boolean' ? converter.options!.blurhash : undefined
                variant.blurhash = await encodeImageToBlurhash(variant.input!, options)
              } catch (error) {
                logger.error(error.message)
              }
            }

            await attachmentManager.save(variant)
          }
        }
      }
    }

    if (Array.isArray(this.#record.model.$original[this.#attributeName])) {
      data[string.snakeCase(this.#attributeName)] = JSON.stringify(attachments.map((att) => att.toObject()))
    } else {
      data[string.snakeCase(this.#attributeName)] = JSON.stringify(attachments[0].toObject())
    }

    const trx = await db.transaction()

    trx.after('rollback', () => {
      for (let i = 0; i < attachments.length; i++) {
        for (const variant of attachments[i].variants!) {
          attachmentManager.delete(variant)
        }
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
