import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { renderAttachmentsMigration } from './render_attachments_migration.js'

export type CreateAttachmentsMigrationFileOptions = {
  directory: string
  tableName?: string
  timestamp?: number
}

export async function createAttachmentsMigrationFile(
  options: CreateAttachmentsMigrationFileOptions
): Promise<string> {
  const tableName = options.tableName ?? 'attachments'
  const contents = renderAttachmentsMigration({ tableName })
  const timestamp = options.timestamp ?? Date.now()
  const filePath = join(options.directory, `${timestamp}_create_${tableName}_table.ts`)

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, 'utf8')

  return filePath
}
