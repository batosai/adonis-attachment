/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import string from '@adonisjs/core/helpers/string'
import { AttachmentError } from '../../../errors.js'

export type AttachmentTableNames = {
  tableName: string
  linksTableName: string
}

/**
 * Resolves the blob and polymorphic-link table names from one base table name.
 */
export function resolveAttachmentTableNames(tableName = 'attachments'): AttachmentTableNames {
  if (!/^[a-z][a-z0-9_]*$/.test(tableName)) {
    throw new AttachmentError('Lucid attachment table names must be snake_case identifiers', {
      code: 'E_INVALID_ATTACHMENT_TABLE_NAME',
    })
  }

  return {
    tableName,
    linksTableName: `${string.singular(tableName)}_links`,
  }
}
