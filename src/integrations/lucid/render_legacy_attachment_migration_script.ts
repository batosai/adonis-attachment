/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export type RenderLegacyAttachmentMigrationScriptOptions = {
  defaultDisk?: string
}

export function renderLegacyAttachmentMigrationScript(
  options: RenderLegacyAttachmentMigrationScriptOptions = {}
): string {
  const defaultDisk = options.defaultDisk ?? 'public'

  return `import { randomUUID } from 'node:crypto'

import {
  AttachmentModel,
  migrateLegacyAttachmentRecords,
  type LegacyAttachmentMigrationRecord,
} from '@jrmc/adonis-attachment/lucid'

async function main(): Promise<void> {
  const result = await migrateLegacyAttachmentRecords({
    records: legacyAttachmentRecords(),
    defaultDisk: '${defaultDisk}',
    createId: randomUUID,
    writer: {
      insert: (rows) => AttachmentModel.createMany(rows),
    },
  })

  console.info(
    \`Migrated \${result.attachments} attachments and \${result.variants} variants; skipped \${result.skipped} empty values.\`
  )
}

async function* legacyAttachmentRecords(): AsyncGenerator<LegacyAttachmentMigrationRecord> {
  // Iterate over the legacy model and yield one value per attachment field.
  // Example owner: { type: 'users', id: user.id.toString(), field: 'avatar' }
  throw new Error('Implement legacyAttachmentRecords before running this script')
}

void main()
`
}
