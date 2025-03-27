import type { LucidRow } from '@adonisjs/lucid/types/model'
import type { RowWithAttachment } from '../src/types/mixin.js'
import type { RegenerateOptions } from '../src/types/regenerate.js'

import Record from '../src/services/record_with_attachment.js'

export default class RegenerateService {
  #record?: Record
  // #Model?: LucidModel
  #row?: RowWithAttachment
  #options?: RegenerateOptions

  // model(Object: LucidModel, options: RegenerateOptions) {
  //   this.#Model = Object
  //   this.#options = options
  // }

  row(row: LucidRow, options: RegenerateOptions = {}) {
    this.#row = row as RowWithAttachment
    this.#options = options

    this.#record = new Record(this.#row)

    return this
  }

  run() {
    if (this.#record) {
      this.#record.regenerateVariants(this.#options)
    }
  }
}
