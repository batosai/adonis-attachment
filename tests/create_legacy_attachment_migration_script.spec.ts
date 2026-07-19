/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test } from '@japa/runner'

import { createLegacyAttachmentMigrationScript } from '../src/integrations/lucid/index.js'

test.group('createLegacyAttachmentMigrationScript', () => {
  test('writes a timestamped migration script template', async ({ assert }) => {
    const directory = await mkdtemp(join(tmpdir(), 'adonis-attachment-'))

    try {
      const filePath = await createLegacyAttachmentMigrationScript({
        directory,
        defaultDisk: 's3',
        timestamp: 1700000000000,
      })

      assert.equal(filePath, join(directory, '1700000000000_migrate_v5_attachments.ts'))
      const contents = await readFile(filePath, 'utf8')
      assert.include(contents, "defaultDisk: 's3'")
      assert.include(contents, 'migrateLegacyAttachmentRecords')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
