import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test } from '@japa/runner'

import { createAttachmentsMigrationFile } from '../src/integrations/lucid/create_attachments_migration_file.js'

test.group('createAttachmentsMigrationFile', () => {
  test('writes a timestamped Lucid migration file', async ({ assert }) => {
    const directory = await mkdtemp(join(tmpdir(), 'adonis-attachment-'))

    try {
      const filePath = await createAttachmentsMigrationFile({
        directory,
        tableName: 'media_attachments',
        timestamp: 1700000000000,
      })

      assert.equal(filePath, join(directory, '1700000000000_create_media_attachments_table.ts'))
      assert.include(await readFile(filePath, 'utf8'), 'CreateMediaAttachmentsTable')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
