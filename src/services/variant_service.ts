/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Attachment, LucidOptions } from '../types/attachment.js'
import type { RecordWithAttachment } from '../types/service.js'
import type { ConverterInitializeAttributes } from '../types/converter.js'

import logger from '@adonisjs/core/services/logger'
import VariantGeneratorService from './variant/variant_generator_service.js'
import attachmentManager from '../../services/main.js'
import VariantPersisterService from './variant/variant_persister_service.js'

export default class VariantService {
  #record: RecordWithAttachment
  #attributeName: string
  #options: LucidOptions
  #filters?: { variants?: string[] }
  #variantGenerator: VariantGeneratorService
  #variantPersister: VariantPersisterService

  constructor({ record, attributeName, options, filters }: ConverterInitializeAttributes) {
    this.#record = record
    this.#attributeName = attributeName
    this.#options = options
    this.#filters = filters

    const model = record.row.constructor as LucidModel
    this.#variantGenerator = new VariantGeneratorService()
    this.#variantPersister = new VariantPersisterService({
      id: record.row.$primaryKeyValue?.toString() || record.row.$attributes['id'],
      modelTable: (record.row.constructor as LucidModel).table,
      attributeName: (record.row.constructor as LucidModel).$getColumn(attributeName)!.columnName,
      multiple: Array.isArray(record.row.$original[attributeName]),
      primaryKey: model.$getColumn(model.primaryKey)?.columnName ?? model.primaryKey ?? 'id',
    })
  }

  async run() {
    try {
      const attachments = await this.#getAttachments()

      if (!this.#shouldProcess(attachments)) {
        return
      }

      const expected = Array.isArray(this.#record.row.$original[this.#attributeName])
        ? JSON.stringify(attachments.map((attachment) => JSON.parse(attachment.toDbString())))
        : attachments[0].toDbString()
      const previous = attachments.map((attachment) => [...(attachment.variants ?? [])])
      const selected = (key: string) =>
        this.#filters?.variants === undefined || this.#filters.variants.includes(key)
      attachments.forEach((attachment) => {
        attachment.variants = attachment.variants?.filter((variant) => !selected(variant.key))
      })
      let variants
      try {
        variants = await this.#variantGenerator.generate({
          attachments,
          options: this.#options,
          filters: this.#filters,
        })
        await this.#variantPersister.persist({ attachments, variants, expected })
      } catch (error) {
        await Promise.all(
          attachments.flatMap((attachment, index) =>
            (attachment.variants ?? [])
              .filter((variant) => !previous[index].includes(variant))
              .map((variant) => attachmentManager.remove(variant))
          )
        )
        attachments.forEach((attachment, index) => {
          attachment.variants = previous[index]
        })
        throw error
      }
      await Promise.all(
        previous
          .flat()
          .filter((variant) => selected(variant.key))
          .map((variant) => attachmentManager.remove(variant))
      )

      return variants
    } catch (error) {
      logger.error(`VariantService.run failed: ${error.message}`)
      throw error
    }
  }

  async #getAttachments(): Promise<Attachment[]> {
    // await this.#record.row.refresh()
    return this.#record.getAttachments({
      attributeName: this.#attributeName,
    })
  }

  #shouldProcess(attachments: Attachment[]): boolean {
    return !!(attachments?.length && this.#options?.variants?.length)
  }
}
