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
import VariantPurgerService from './variant/variant_purger_service.js'
import VariantPersisterService from './variant/variant_persister_service.js'

export default class VariantService {
  #record: RecordWithAttachment
  #attributeName: string
  #options: LucidOptions
  #filters?: { variants?: string[] }
  #variantGenerator: VariantGeneratorService
  #variantPurger: VariantPurgerService
  #variantPersister: VariantPersisterService

  constructor({ record, attributeName, options, filters }: ConverterInitializeAttributes) {
    this.#record = record
    this.#attributeName = attributeName
    this.#options = options
    this.#filters = filters

    this.#variantGenerator = new VariantGeneratorService()
    this.#variantPurger = new VariantPurgerService(filters)
    this.#variantPersister = new VariantPersisterService({
      id: record.row.$attributes['id'],
      modelTable: (record.row.constructor as LucidModel).table,
      attributeName,
      multiple: Array.isArray(record.row.$original[attributeName])
    })
  }

  async run() {
    try {
      const attachments = await this.#getAttachments()

      if (!this.#shouldProcess(attachments)) {
        return
      }

      await this.#variantPurger.purge(attachments)
      const variants = await this.#variantGenerator.generate({ attachments, options: this.#options, filters: this.#filters })
      await this.#variantPersister.persist({ attachments, variants })

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
