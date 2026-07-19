/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentOwner } from './attachment_owner.js'
import {
  migrateLegacyAttachment,
  type LegacyAttachment,
  type MigratedAttachmentRow,
} from './migrate_legacy_attachment.js'

export type LegacyAttachmentMigrationRecord = {
  owner: AttachmentOwner
  value: LegacyAttachment | string | null | undefined
}

export type LegacyAttachmentMigrationWriter = {
  insert(rows: readonly MigratedAttachmentRow[]): Promise<void>
}

export type MigrateLegacyAttachmentRecordsOptions = {
  records: Iterable<LegacyAttachmentMigrationRecord> | AsyncIterable<LegacyAttachmentMigrationRecord>
  defaultDisk: string
  createId: () => string
  writer: LegacyAttachmentMigrationWriter
  batchSize?: number
}

export type LegacyAttachmentMigrationResult = {
  attachments: number
  variants: number
  skipped: number
}

/**
 * Migrates a stream of legacy v5 JSON values into attachment-table rows.
 * The caller owns source-model iteration and database transactions; this keeps
 * the migration compatible with custom Lucid models and other persistence layouts.
 */
export async function migrateLegacyAttachmentRecords(
  options: MigrateLegacyAttachmentRecordsOptions
): Promise<LegacyAttachmentMigrationResult> {
  const batchSize = options.batchSize ?? 100

  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error('Legacy attachment migration batchSize must be a positive integer')
  }

  const result: LegacyAttachmentMigrationResult = {
    attachments: 0,
    variants: 0,
    skipped: 0,
  }
  let batch: MigratedAttachmentRow[] = []

  for await (const record of options.records) {
    if (record.value === null || record.value === undefined) {
      result.skipped += 1
      continue
    }

    const rows = migrateLegacyAttachment(record.value, {
      owner: record.owner,
      defaultDisk: options.defaultDisk,
      createId: options.createId,
    })

    result.attachments += 1
    result.variants += rows.length - 1
    batch.push(...rows)

    if (batch.length >= batchSize) {
      await options.writer.insert(batch)
      batch = []
    }
  }

  if (batch.length > 0) {
    await options.writer.insert(batch)
  }

  return result
}
