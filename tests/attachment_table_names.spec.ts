/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { AttachmentLinkModel } from '../src/integrations/lucid/models/attachment_link_model.js'
import { AttachmentModel } from '../src/integrations/lucid/models/attachment_model.js'
import { configureLucidAttachmentTables } from '../src/integrations/lucid/schema/configure_lucid_attachment_tables.js'
import { resolveAttachmentTableNames } from '../src/integrations/lucid/schema/attachment_table_names.js'

test.group('Lucid attachment table names', (group) => {
  group.each.teardown(() => {
    configureLucidAttachmentTables()
  })

  test('derives the polymorphic link table from the singular base table name', ({ assert }) => {
    assert.deepEqual(resolveAttachmentTableNames(), {
      tableName: 'attachments',
      linksTableName: 'attachment_links',
    })
    assert.deepEqual(resolveAttachmentTableNames('media_attachments'), {
      tableName: 'media_attachments',
      linksTableName: 'media_attachment_links',
    })
  })

  test('applies configured names to the default Lucid models', ({ assert }) => {
    const tables = configureLucidAttachmentTables('media_attachments')

    assert.equal(tables.linksTableName, 'media_attachment_links')
    assert.equal(AttachmentModel.table, 'media_attachments')
    assert.equal(AttachmentLinkModel.table, 'media_attachment_links')
  })

  test('rejects unsafe base table names', ({ assert }) => {
    assert.throws(
      () => resolveAttachmentTableNames('attachments; drop table users'),
      'Lucid attachment table names must be snake_case identifiers',
    )
  })
})
