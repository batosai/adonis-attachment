import { test } from '@japa/runner'

import { renderAttachmentsMigration } from '../index.js'

test.group('renderAttachmentsMigration', () => {
  test('renders a polymorphic table with variants in the same table', ({ assert }) => {
    const migration = renderAttachmentsMigration()

    assert.include(migration, "protected tableName = 'attachments'")
    assert.include(migration, "table.string('attachable_type').notNullable()")
    assert.include(migration, "table.string('attachable_id').notNullable()")
    assert.include(migration, "table.string('owner_key', 64).nullable().unique()")
    assert.include(migration, "table.uuid('parent_id').nullable()")
    assert.include(migration, "table.string('variant_key').nullable()")
    assert.include(migration, "table.unique(['parent_id', 'variant_key'])")
  })

  test('supports a custom snake_case table name', ({ assert }) => {
    const migration = renderAttachmentsMigration({ tableName: 'media_attachments' })

    assert.include(migration, 'export default class CreateMediaAttachmentsTable')
    assert.include(migration, "protected tableName = 'media_attachments'")
  })

  test('rejects unsafe table names', ({ assert }) => {
    assert.throws(
      () => renderAttachmentsMigration({ tableName: 'attachments; drop table users' }),
      'Lucid attachment table names must be snake_case identifiers'
    )
  })
})
