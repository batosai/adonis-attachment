/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { Database } from '@adonisjs/lucid/database'

import { AttachmentModel } from '../../src/integrations/lucid/attachment_model.js'
import { AttachmentLinkModel } from '../../src/integrations/lucid/attachment_link_model.js'

export async function createLucidTestDatabase(): Promise<Database> {
  const database = new Database(
    {
      connection: 'sqlite',
      connections: {
        sqlite: {
          client: 'better-sqlite3',
          connection: { filename: ':memory:' },
          useNullAsDefault: true,
        },
      },
    },
    { trace() {} } as never,
    {
      async emit() {},
      async emitSerial() {},
      hasListeners() {
        return false
      },
    } as never
  )

  AttachmentModel.useAdapter(database.modelAdapter())
  AttachmentLinkModel.useAdapter(database.modelAdapter())

  await database.connection().schema.createTable('attachments', (table) => {
    table.string('id').primary()
    table.string('parent_id').nullable().references('id').inTable('attachments').onDelete('CASCADE')
    table.string('variant_key').nullable()
    table.string('disk').notNullable()
    table.string('path').notNullable()
    table.string('name').notNullable()
    table.string('original_name').notNullable()
    table.string('mime_type').notNullable()
    table.string('extname').notNullable()
    table.bigInteger('size').unsigned().notNullable()
    table.json('metadata').nullable()
    table.timestamp('created_at').notNullable()
    table.timestamp('updated_at').notNullable()
    table.index(['parent_id'])
    table.unique(['parent_id', 'variant_key'])
  })

  await database.connection().schema.createTable('attachment_links', (table) => {
    table.string('id').primary()
    table.string('attachable_type').notNullable()
    table.string('attachable_id').notNullable()
    table.string('field').notNullable()
    table.string('owner_key', 64).nullable().unique()
    table.integer('position').unsigned().nullable()
    table.string('attachment_id').notNullable().references('id').inTable('attachments').onDelete('CASCADE')
    table.timestamp('created_at').notNullable()
    table.timestamp('updated_at').notNullable()
    table.index(['attachable_type', 'attachable_id', 'field'])
    table.index(['attachment_id'])
  })

  return database
}
