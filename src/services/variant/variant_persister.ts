import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Attachment, Variant } from '../../types/attachment.js'
import type { RecordWithAttachment } from '../../types/service.js'

import logger from '@adonisjs/core/services/logger'
import string from '@adonisjs/core/helpers/string'
import db from '@adonisjs/lucid/services/db'
import attachmentManager from '../../../services/main.js'

export default class VariantPersister {
  #record: RecordWithAttachment
  #attributeName: string

  constructor(record: RecordWithAttachment, attributeName: string) {
    this.#record = record
    this.#attributeName = attributeName
  }

  async persist({ attachments, variants }: {
    attachments: Attachment[],
    variants: Variant[]
  }): Promise<void> {
    const rollback = () => this.#rollbackVariants(variants)

    const trx = await db.transaction()
    trx.after('rollback', rollback)

    try {
      const data = this.#prepareUpdateData(attachments)
      await this.#executeUpdate(trx, data)
      await trx.commit()
    } catch (error) {
      logger.error(`Persist failed: ${error.message}`)
      await trx.rollback()
      throw error
    }
  }

  #rollbackVariants(variants: Variant[]): void {
    variants.forEach(variant => {
      try {
        attachmentManager.remove(variant)
      } catch (error) {
        logger.error(`Rollback failed for variant: ${error.message}`)
      }
    })
  }

  #prepareUpdateData(attachments: Attachment[]): Record<string, string> {
    const index = string.snakeCase(this.#attributeName)
    const isArray = Array.isArray(this.#record.row.$original[this.#attributeName])

    const data = isArray
      ? attachments.map(att => att.toObject())
      : attachments[0]?.toObject()

    return { [index]: JSON.stringify(data) }
  }

  async #executeUpdate(trx: any, data: Record<string, string>): Promise<void> {
    const Model = this.#record.row.constructor as LucidModel
    const id = this.#record.row.$attributes['id']

    await trx.query()
      .from(Model.table)
      .where('id', id)
      .update(data)
  }
}