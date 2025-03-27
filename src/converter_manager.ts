import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Converter, ConverterInitializeAttributes } from './types/converter.js'
import type { Attachment, Variant, LucidOptions } from './types/attachment.js'
import type { Record } from './types/service.js'

import logger from '@adonisjs/core/services/logger'
import string from '@adonisjs/core/helpers/string'
import db from '@adonisjs/lucid/services/db'
import attachmentManager from '../services/main.js'
import * as errors from './errors.js'

export class ConverterManager {
  #record: Record
  #attributeName: string
  #options: LucidOptions
  #filters?: {
    variants?: string[]
  }

  constructor({ record, attributeName, options, filters }: ConverterInitializeAttributes) {
    this.#record = record
    this.#attributeName = attributeName
    this.#options = options
    this.#filters = filters
  }

  async run() {
    const attachments: Attachment[] = this.#record.getAttachments({
      attributeName: this.#attributeName,
    })

    const variants: Variant[] = []

    await this.#purge(attachments)

    if (!attachments || !this.#options.variants || !this.#options.variants.length) {
      return
    }

    for await (const key of this.#options.variants) {
      if (this.#filters?.variants !== undefined && !this.#filters?.variants?.includes(key)) {
        continue
      }

      const converter = (await attachmentManager.getConverter(key)) as Converter

      if (converter) {
        for await (const attachment of attachments) {
          const variant = await this.#generate({
            key,
            attachment,
            converter
          })
          variants.push(variant)
        }
      }
    }

    return this.#commit(attachments, () => {
      for (let i = 0; i < variants.length; i++) {
        attachmentManager.remove(variants[i])
      }
    })
  }

  async #generate({ key, attachment, converter } : { key: string, attachment: Attachment, converter: Converter }) {
    const input = attachment.input!
    const output = await converter.handle({
      input,
      options: converter.options!,
    })

    if (output === undefined) {
      throw new errors.E_CANNOT_PATH_BY_CONVERTER()
    }

    const variant = await attachment.createVariant(key, output)

    if (converter.options!.blurhash) {
      if (
        (typeof converter.options!.blurhash !== 'boolean' &&
          converter.options!.blurhash.enabled === true) ||
        converter.options!.blurhash === true
      ) {
        try {
          const options =
            typeof converter.options!.blurhash !== 'boolean'
              ? converter.options!.blurhash
              : undefined

          await variant.generateBlurhash(options)
        } catch (error) {
          logger.error(error.message)
        }
      }
    }

    await attachmentManager.write(variant)

    return variant
  }

  async #commit(attachments: Attachment[], rollback: () => void) {
    const Model = this.#record.row.constructor as LucidModel
    const id = this.#record.row.$attributes['id']
    const data: any = {}
    const index = string.snakeCase(this.#attributeName)

    if (Array.isArray(this.#record.row.$original[this.#attributeName])) {
      data[index] = JSON.stringify(
        attachments.map((att) => att.toObject())
      )
    } else {
      data[index] = JSON.stringify(attachments[0].toObject())
    }

    const trx = await db.transaction()
    trx.after('rollback', rollback)

    try {
      await trx.query().from(Model.table).where('id', id).update(data)

      return trx.commit()
    } catch (error) {
      return trx.rollback()
    }
  }

  async #purge(attachments: Attachment[]) {
    return Promise.all(
      attachments.map(async (attachment) => {
        if (attachment.variants) {
          await Promise.all(
            attachment.variants.map(async (variant) => {
              if (this.#filters?.variants !== undefined && !this.#filters?.variants?.includes(variant.key)) {
                return
              }
              return attachmentManager.remove(variant)
            })
          )

          if (this.#filters?.variants !== undefined) {
            attachment.variants = await attachment.variants.filter((variant) => !this.#filters?.variants?.includes(variant.key))
          } else {
            attachment.variants = []
          }
        }
      })
    )
  }
}
