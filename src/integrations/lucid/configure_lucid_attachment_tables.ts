/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { AttachmentLinkModel } from './attachment_link_model.js'
import { AttachmentModel } from './attachment_model.js'
import { resolveAttachmentTableNames, type AttachmentTableNames } from './attachment_table_names.js'

/**
 * Applies an application's configured attachment table names to the default Lucid models.
 */
export function configureLucidAttachmentTables(tableName?: string): AttachmentTableNames {
  const tables = resolveAttachmentTableNames(tableName)

  AttachmentModel.table = tables.tableName
  AttachmentLinkModel.table = tables.linksTableName

  return tables
}
