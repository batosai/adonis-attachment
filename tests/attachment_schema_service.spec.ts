/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { AttachmentSchemaService } from '../src/integrations/lucid/schema/attachment_schema_service.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'

test.group('AttachmentSchemaService', (group) => {
  let database: Awaited<ReturnType<typeof createLucidTestDatabase>>

  group.setup(async () => {
    database = await createLucidTestDatabase()
  })

  group.teardown(async () => {
    await database.manager.closeAll()
  })

  test('creates and drops both tables using a custom base table name', async ({ assert }) => {
    const service = new AttachmentSchemaService(database.connection().getWriteClient(), {
      tableName: 'media_attachments',
    })

    await service.createTables()

    assert.isTrue(await database.connection().schema.hasTable('media_attachments'))
    assert.isTrue(await database.connection().schema.hasTable('media_attachment_links'))
    assert.isTrue(await database.connection().schema.hasColumn('media_attachments', 'blurhash'))

    await service.dropTables()

    assert.isFalse(await database.connection().schema.hasTable('media_attachments'))
    assert.isFalse(await database.connection().schema.hasTable('media_attachment_links'))
  })

  test('uses the AttachmentLinkModel default table name', async ({ assert }) => {
    const service = new AttachmentSchemaService(database.connection().getWriteClient())

    await service.dropTables()
    await service.createTables()

    assert.isTrue(await database.connection().schema.hasTable('adonis_attachments'))
    assert.isTrue(await database.connection().schema.hasTable('adonis_attachment_links'))
    assert.isTrue(await database.connection().schema.hasColumn('adonis_attachments', 'blurhash'))
    assert.isFalse(await database.connection().schema.hasTable('attachments_links'))
  })

  test('upgrades an existing blob table with the blurhash column', async ({ assert }) => {
    const tableName = 'legacy_attachments'
    await database.connection().schema.createTable(tableName, (table) => {
      table.uuid('id').primary()
    })
    const service = new AttachmentSchemaService(database.connection().getWriteClient(), { tableName })

    await service.addBlurhashColumn()

    assert.isTrue(await database.connection().schema.hasColumn(tableName, 'blurhash'))

    await service.dropBlurhashColumn()
    await database.connection().schema.dropTable(tableName)

    assert.isFalse(await database.connection().schema.hasColumn(tableName, 'blurhash'))
  })

  test('upgrades and rolls back the blob foreign key without losing links', async ({ assert }) => {
    const service = new AttachmentSchemaService(database.connection().getWriteClient())
    await service.restoreCascadingBlobDeletion()
    await database.table('adonis_attachments').insert({
      id: 'blob', disk: 'fs', path: 'file.txt', name: 'file.txt', original_name: 'file.txt',
      mime_type: 'text/plain', extname: 'txt', size: 1, created_at: '2026-01-01', updated_at: '2026-01-01',
    })
    await database.table('adonis_attachment_links').insert({
      id: 'link', attachment_id: 'blob', attachable_type: 'users', attachable_id: '1', field: 'avatar',
      created_at: '2026-01-01', updated_at: '2026-01-01',
    })
    await service.protectReferencedBlobs()
    await assert.rejects(() => database.from('adonis_attachments').where('id', 'blob').delete(), /FOREIGN KEY/)
    assert.isNotNull(await database.from('adonis_attachment_links').where('id', 'link').first())
    await service.restoreCascadingBlobDeletion()
    await database.from('adonis_attachments').where('id', 'blob').delete()
    assert.isNull(await database.from('adonis_attachment_links').where('id', 'link').first())
  })
})
