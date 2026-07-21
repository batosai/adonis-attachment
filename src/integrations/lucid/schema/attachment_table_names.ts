/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import string from '@adonisjs/core/helpers/string'

export type AttachmentTableNames = {
  tableName: string
  linksTableName: string
}

/**
 * Resolves the blob and polymorphic-link table names from one base table name.
 */
export function resolveAttachmentTableNames(tableName = 'attachments'): AttachmentTableNames {
  if (!/^[a-z][a-z0-9_]*$/.test(tableName)) {
    throw new Error('Lucid attachment table names must be snake_case identifiers')
  }

  return {
    tableName,
    linksTableName: `${string.singular(tableName)}_links`,
  }
}
