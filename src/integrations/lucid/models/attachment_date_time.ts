import { column } from '@adonisjs/lucid/orm'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import { DateTime } from 'luxon'

/** Preserve Lucid's date validation/serialization, but bind native dates on Oracle. */
export const attachmentDateTime: typeof column.dateTime = (options) => (target, property) => {
  column.dateTime(options)(target, property)
  const Model = target.constructor as LucidModel
  const definition = Model.$getColumn(property)!
  const prepare = definition.prepare!
  definition.prepare = (value, attribute, row) => {
    const prepared = prepare(value, attribute, row)
    if (DateTime.isDateTime(value) && Model.$adapter.modelClient(row).dialect.name === 'oracledb') {
      // Do not depend on session NLS_TIMESTAMP_FORMAT to parse Lucid's SQL strings.
      return value.toJSDate()
    }
    return prepared
  }
}
