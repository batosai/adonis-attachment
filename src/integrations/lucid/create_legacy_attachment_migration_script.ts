import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { renderLegacyAttachmentMigrationScript } from './render_legacy_attachment_migration_script.js'

export type CreateLegacyAttachmentMigrationScriptOptions = {
  directory: string
  defaultDisk?: string
  timestamp?: number
}

export async function createLegacyAttachmentMigrationScript(
  options: CreateLegacyAttachmentMigrationScriptOptions
): Promise<string> {
  const timestamp = options.timestamp ?? Date.now()
  const filePath = join(options.directory, `${timestamp}_migrate_v5_attachments.ts`)
  const contents = renderLegacyAttachmentMigrationScript({
    ...(options.defaultDisk ? { defaultDisk: options.defaultDisk } : {}),
  })

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, 'utf8')

  return filePath
}
