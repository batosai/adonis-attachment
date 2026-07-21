/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { join } from 'node:path'

export type AttachmentsTableStubOptions = {
  directory: string
  tableName?: string
  timestamp?: number
}

export type AttachmentsTableStubState = {
  destination: string
  tableName: string
  linksTableName: string
  className: string
}

/**
 * Builds the state consumed by the attachments-table migration stub.
 */
export function createAttachmentsTableStubState(
  options: AttachmentsTableStubOptions
): AttachmentsTableStubState {
  const tableName = options.tableName ?? 'attachments'

  if (!/^[a-z][a-z0-9_]*$/.test(tableName)) {
    throw new Error('Lucid attachment table names must be snake_case identifiers')
  }

  const timestamp = options.timestamp ?? Date.now()

  return {
    destination: join(options.directory, `${timestamp}_create_${tableName}_table.ts`),
    tableName,
    linksTableName: `${tableName}_links`,
    className: toPascalCase(tableName),
  }
}

function toPascalCase(value: string): string {
  return value.replace(/(^|_)([a-z0-9])/g, (_, _separator: string, character: string) =>
    character.toUpperCase()
  )
}
