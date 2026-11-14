/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment, Variant } from '../../types/attachment.js'

import { isDeepStrictEqual } from 'node:util'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import attachmentManager from '../../../services/main.js'

type PersistAttributes = {
  id: string
  modelTable: string
  attributeName: string
  multiple: boolean
  primaryKey: string
}

export default class VariantPersisterService {
  #id: string
  #modelTable: string
  #attributeName: string
  #multiple: boolean
  #primaryKey: string

  constructor({ id, modelTable, attributeName, multiple, primaryKey }: PersistAttributes) {
    this.#id = id
    this.#modelTable = modelTable
    this.#attributeName = attributeName
    this.#multiple = multiple
    this.#primaryKey = primaryKey
  }

  async persist({
    attachments,
    variants,
    expected,
  }: {
    attachments: Attachment[]
    variants: Variant[]
    expected: string
  }): Promise<void> {
    const rollback = () => this.#rollbackVariants(variants)

    const trx = await db.transaction()
    trx.after('rollback', rollback)

    try {
      const data = this.#prepareUpdateData(attachments)
      await this.#executeUpdate(trx, data, expected)
      await trx.commit()
    } catch (error) {
      logger.error(`Persist failed: ${error.message}`)
      await trx.rollback()
      throw error
    }
  }

  async #rollbackVariants(variants: Variant[]): Promise<void> {
    await Promise.all(
      variants.map(async (variant) => {
        try {
          await attachmentManager.remove(variant)
        } catch (error) {
          logger.error(`Rollback failed for variant: ${error.message}`)
        }
      })
    )
  }

  #prepareUpdateData(attachments: Attachment[]): Record<string, string> {
    const index = this.#attributeName

    const value = this.#multiple
      ? JSON.stringify(attachments.map((att) => JSON.parse(att.toDbString())))
      : (attachments[0]?.toDbString() ?? JSON.stringify(null))

    return { [index]: value }
  }

  async #executeUpdate(trx: any, data: Record<string, string>, expected: string): Promise<void> {
    const current = await trx
      .query()
      .from(this.#modelTable)
      .where(this.#primaryKey, this.#id)
      .forUpdate()
      .first()
    const value = current?.[this.#attributeName]
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!current || !isDeepStrictEqual(parsed, JSON.parse(expected))) {
      throw new Error('Attachment changed during variant generation')
    }
    await trx.query().from(this.#modelTable).where(this.#primaryKey, this.#id).update(data)
  }
}
