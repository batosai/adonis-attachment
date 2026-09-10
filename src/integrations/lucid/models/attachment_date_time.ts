import { column } from '@adonisjs/lucid/orm'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import { DateTime } from 'luxon'

/** Preserve Lucid's date handling, but bind native dates on Oracle and SQL Server. */
export const attachmentDateTime: typeof column.dateTime = (options) => (target, property) => {
  column.dateTime(options)(target, property)
  const Model = target.constructor as LucidModel
  const definition = Model.$getColumn(property)!
  const prepare = definition.prepare!
  definition.prepare = (value, attribute, row) => {
    const prepared = prepare(value, attribute, row)
    if (DateTime.isDateTime(value) && ['oracledb', 'mssql'].includes(Model.$adapter.modelClient(row).dialect.name)) {
      // Avoid Oracle NLS parsing and SQL Server interpreting local SQL strings as UTC.
      return value.toJSDate()
    }
    return prepared
  }
}
