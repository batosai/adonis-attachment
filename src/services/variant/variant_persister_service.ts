import type { Attachment, Variant } from '../../types/attachment.js'

import logger from '@adonisjs/core/services/logger'
import string from '@adonisjs/core/helpers/string'
import db from '@adonisjs/lucid/services/db'
import attachmentManager from '../../../services/main.js'

type PersistAttributes = {
  id: string
  modelTable: string
  attributeName: string
  multiple: boolean
}

export default class VariantPersisterService {
  #id: string
  #modelTable: string
  #attributeName: string
  #multiple: boolean

  constructor({ id, modelTable, attributeName, multiple }: PersistAttributes) {
    this.#id = id
    this.#modelTable = modelTable
    this.#attributeName = attributeName
    this.#multiple = multiple
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

    const data = this.#multiple
      ? attachments.map(att => att.toObject())
      : attachments[0]?.toObject()

    return { [index]: JSON.stringify(data) }
  }

  async #executeUpdate(trx: any, data: Record<string, string>): Promise<void> {
    await trx.query()
      .from(this.#modelTable)
      .where('id', this.#id)
      .update(data)
  }
}