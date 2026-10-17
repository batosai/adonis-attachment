import type { LucidModel, LucidRow } from '@adonisjs/lucid/types/model'

/** SQL Server UNIQUEIDENTIFIER reads default to uppercase; keep UUIDs canonical. */
export function consumeAttachmentUuid(value: string | null, _attribute: string, row: LucidRow): string | null {
  const Model = row.constructor as LucidModel
  return value !== null && Model.$adapter.modelClient(row).dialect.name === 'mssql'
    ? value.toLowerCase()
    : value
}
