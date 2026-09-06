/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentOwner } from '../../relations/attachment_owner.js'
import { AttachmentError } from '../../../../errors.js'
import {
  migrateLegacyAttachment,
  type LegacyAttachment,
  type MigratedAttachmentRows,
} from './migrate_legacy_attachment.js'

export type LegacyAttachmentMigrationRecord = {
  owner: AttachmentOwner
  value: LegacyAttachment | readonly LegacyAttachment[] | string | null | undefined
  kind?: 'one' | 'many'
  position?: number
}

export type LegacyAttachmentMigrationWriter = {
  insert(rows: MigratedAttachmentRows): Promise<void>
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
    throw new AttachmentError('Legacy attachment migration batchSize must be a positive integer', {
      code: 'E_INVALID_LEGACY_MIGRATION_BATCH_SIZE',
    })
  }

  const result: LegacyAttachmentMigrationResult = {
    attachments: 0,
    variants: 0,
    skipped: 0,
  }
  let batch: MigratedAttachmentRows = { blobs: [], links: [] }

  for await (const record of options.records) {
    if (record.value === null || record.value === undefined) {
      result.skipped += 1
      continue
    }

    const rows = migrateLegacyAttachment(record.value, {
      owner: record.owner,
      defaultDisk: options.defaultDisk,
      createId: options.createId,
      ...(record.kind ? { kind: record.kind } : {}),
      ...(record.position !== undefined ? { position: record.position } : {}),
    })

    if (rows.links.length === 0) {
      result.skipped += 1
      continue
    }
    result.attachments += rows.links.length
    result.variants += rows.blobs.length - rows.links.length
    batch.blobs.push(...rows.blobs)
    batch.links.push(...rows.links)

    if (batch.blobs.length >= batchSize) {
      await options.writer.insert(batch)
      batch = { blobs: [], links: [] }
    }
  }

  if (batch.blobs.length > 0) {
    await options.writer.insert(batch)
  }

  return result
}
