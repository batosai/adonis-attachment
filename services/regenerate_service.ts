import type { LucidRow, LucidModel } from '@adonisjs/lucid/types/model'
import type { RowWithAttachment } from '../src/types/mixin.js'
import type { RegenerateOptions } from '../src/types/regenerate.js'

import RecordWithAttachment from '../src/services/record_with_attachment.js'

export default class RegenerateService {
  #Model?: LucidModel
  #row?: RowWithAttachment
  #options?: RegenerateOptions

  model(Model: LucidModel, options: RegenerateOptions = {}) {
    this.#Model = Model
    this.#options = options

    return this
  }

  row(row: LucidRow, options: RegenerateOptions = {}) {
    this.#row = row as RowWithAttachment
    this.#options = options

    return this
  }

  async run() {
    if (this.#row) {
      const record = new RecordWithAttachment(this.#row)
      return record.regenerateVariants(this.#options)
    }
    else if (this.#Model) {
      const entities = await this.#Model.all() as RowWithAttachment[]

      return Promise.all(
        entities.map(async (entity) => {
          const record = new RecordWithAttachment(entity)
          return record.regenerateVariants(this.#options)
        })
      )
    }
  }
}
