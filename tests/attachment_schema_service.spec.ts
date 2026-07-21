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

    await service.dropTables()

    assert.isFalse(await database.connection().schema.hasTable('media_attachments'))
    assert.isFalse(await database.connection().schema.hasTable('media_attachment_links'))
  })

  test('uses the AttachmentLinkModel default table name', async ({ assert }) => {
    const service = new AttachmentSchemaService(database.connection().getWriteClient())

    await service.dropTables()
    await service.createTables()

    assert.isTrue(await database.connection().schema.hasTable('attachments'))
    assert.isTrue(await database.connection().schema.hasTable('attachment_links'))
    assert.isFalse(await database.connection().schema.hasTable('attachments_links'))
  })
})
