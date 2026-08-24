/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidRow } from '@adonisjs/lucid/types/model'

import type { AttachmentVariantKey } from '../../../../index.js'
import { AttachmentValidationError } from '../../../errors.js'
import {
  getAttachmentRelationDefinitions,
  type AttachmentCollectionRelation,
  type AttachmentRelation,
} from '../relations/attachment_relation.js'

type RegeneratableRow = LucidRow

type RegeneratableModel = {
  query(): {
    paginate(page: number, perPage: number): Promise<{
      all(): RegeneratableRow[]
      hasMorePages: boolean
    }>
  }
}

export type AttachmentRegenerationOptions = {
  /** Limits regeneration to named attachment relation fields. */
  attributes?: readonly string[]
  /** Limits regeneration to named configured variants. */
  variants?: readonly AttachmentVariantKey[]
  /** Number of owners fetched per database query when regenerating a model. */
  batchSize?: number
  /** Number of owners queued in parallel within each page. */
  concurrency?: number
}

export type AttachmentRegenerationResult = {
  rows: number
  attachments: number
}

/**
 * Enqueues idempotent variant regeneration for one Lucid row or every row of a model.
 */
export class AttachmentRegenerator {
  #target:
    | { type: 'row'; row: RegeneratableRow; options: AttachmentRegenerationOptions }
    | { type: 'model'; model: RegeneratableModel; options: AttachmentRegenerationOptions }
    | undefined

  row<Row extends RegeneratableRow>(
    row: Row,
    options: AttachmentRegenerationOptions = {}
  ): this {
    this.#target = { type: 'row', row, options }
    return this
  }

  model<Model extends RegeneratableModel>(
    model: Model,
    options: AttachmentRegenerationOptions = {}
  ): this {
    this.#target = { type: 'model', model, options }
    return this
  }

  async run(): Promise<AttachmentRegenerationResult> {
    if (!this.#target) {
      throw new AttachmentValidationError('Select a Lucid row or model before regenerating variants')
    }

    if (this.#target.type === 'row') {
      return {
        rows: 1,
        attachments: await this.#regenerateRow(this.#target.row, this.#target.options),
      }
    }

    return this.#regenerateModel(this.#target.model, this.#target.options)
  }

  async #regenerateModel(
    model: RegeneratableModel,
    options: AttachmentRegenerationOptions
  ): Promise<AttachmentRegenerationResult> {
    const batchSize = validatePositiveInteger(options.batchSize ?? 100, 'batchSize')
    const concurrency = validatePositiveInteger(options.concurrency ?? 5, 'concurrency')
    const result: AttachmentRegenerationResult = { rows: 0, attachments: 0 }
    let page = 1

    while (true) {
      const paginator = await model.query().paginate(page, batchSize)
      const rows = paginator.all()
      result.rows += rows.length
      result.attachments += await regeneratePage(rows, concurrency, (row) =>
        this.#regenerateRow(row, options)
      )

      if (!paginator.hasMorePages) {
        return result
      }
      page += 1
    }
  }

  async #regenerateRow(
    row: RegeneratableRow,
    options: AttachmentRegenerationOptions
  ): Promise<number> {
    const definitions = getAttachmentRelationDefinitions(row.constructor).filter((definition) =>
      !options.attributes || options.attributes.includes(definition.field)
    )

    if (options.attributes) {
      const known = new Set(definitions.map((definition) => definition.field))
      const unknown = options.attributes.find((attribute) => !known.has(attribute))
      if (unknown) {
        throw new AttachmentValidationError(`Unknown attachment relation "${unknown}"`)
      }
    }

    let attachments = 0
    for (const definition of definitions) {
      const relation = (row as unknown as Record<string, unknown>)[definition.field] as
        | AttachmentRelation
        | AttachmentCollectionRelation

      if (definition.kind === 'one') {
        attachments += (await (relation as AttachmentRelation).regenerateVariants(options.variants)) ? 1 : 0
      } else {
        attachments += await (relation as AttachmentCollectionRelation).regenerateVariants(options.variants)
      }
    }

    return attachments
  }
}

async function regeneratePage(
  rows: readonly RegeneratableRow[],
  concurrency: number,
  regenerate: (row: RegeneratableRow) => Promise<number>
): Promise<number> {
  let next = 0

  const counts = await Promise.all(Array.from({ length: Math.min(rows.length, concurrency) }, async () => {
    let attachments = 0
    while (next < rows.length) {
      const row = rows[next++]!
      attachments += await regenerate(row)
    }
    return attachments
  }))

  return counts.reduce((total, count) => total + count, 0)
}

function validatePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AttachmentValidationError(`${name} must be a positive integer`)
  }

  return value
}
