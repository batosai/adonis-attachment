/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { join } from 'node:path'
import { resolveAttachmentTableNames } from './attachment_table_names.js'

export type AttachmentsTableStubOptions = {
  directory: string
  tableName?: string
  timestamp?: number
}

export type AttachmentsTableStubState = {
  destination: string
  tableName: string
  className: string
}

/**
 * Builds the state consumed by the attachments-table migration stub.
 */
export function createAttachmentsTableStubState(
  options: AttachmentsTableStubOptions
): AttachmentsTableStubState {
  const { tableName } = resolveAttachmentTableNames(options.tableName)

  const timestamp = options.timestamp ?? Date.now()

  return {
    destination: join(options.directory, `${timestamp}_create_${tableName}_table.ts`),
    tableName,
    className: toPascalCase(tableName),
  }
}

function toPascalCase(value: string): string {
  return value.replace(/(^|_)([a-z0-9])/g, (_, _separator: string, character: string) =>
    character.toUpperCase()
  )
}
