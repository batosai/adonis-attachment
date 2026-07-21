/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { join } from 'node:path'

export type LegacyAttachmentMigrationStubOptions = {
  directory: string
  defaultDisk?: string
  timestamp?: number
}

export type LegacyAttachmentMigrationStubState = {
  destination: string
  defaultDisk: string
}

/**
 * Builds the state consumed by the legacy attachment data-migration stub.
 */
export function createLegacyAttachmentMigrationStubState(
  options: LegacyAttachmentMigrationStubOptions
): LegacyAttachmentMigrationStubState {
  const timestamp = options.timestamp ?? Date.now()

  return {
    destination: join(options.directory, `${timestamp}_migrate_v5_attachments.ts`),
    defaultDisk: options.defaultDisk ?? 'public',
  }
}
