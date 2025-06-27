import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Attachment, LucidOptions } from '../types/attachment.js'
import type { RecordWithAttachment } from '../types/service.js'
import type { ConverterInitializeAttributes } from '../types/converter.js'

import logger from '@adonisjs/core/services/logger'
import VariantGenerator from './variant/variant_generator.js'
import VariantPurger from './variant/variant_purger.js'
import VariantPersister from './variant/variant_persister.js'

export default class VariantService {
  #record: RecordWithAttachment
  #attributeName: string
  #options: LucidOptions
  #filters?: { variants?: string[] }
  #variantGenerator: VariantGenerator
  #variantPurger: VariantPurger
  #variantPersister: VariantPersister

  constructor({ record, attributeName, options, filters }: ConverterInitializeAttributes) {
    this.#record = record
    this.#attributeName = attributeName
    this.#options = options
    this.#filters = filters

    this.#variantGenerator = new VariantGenerator()
    this.#variantPurger = new VariantPurger(filters)
    this.#variantPersister = new VariantPersister({
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
    await this.#record.row.refresh()
    return this.#record.getAttachments({
      attributeName: this.#attributeName,
    })
  }

  #shouldProcess(attachments: Attachment[]): boolean {
    return !!(attachments?.length && this.#options?.variants?.length)
  }
}