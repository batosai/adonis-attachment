/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Knex } from 'knex'

export type AttachmentSchemaServiceOptions = {
  tableName?: string
}

/**
 * Owns the versioned database schema used by the Lucid attachment integration.
 */
export class AttachmentSchemaService {
  readonly #connection: Knex
  readonly #tableName: string
  readonly #linksTableName: string

  constructor(connection: Knex, options: AttachmentSchemaServiceOptions = {}) {
    this.#connection = connection
    this.#tableName = options.tableName ?? 'attachments'
    this.#linksTableName = `${this.#tableName}_links`
  }

  createTables(): Promise<void> {
    return this.createBlobsTable().then(() => this.createLinksTable())
  }

  createBlobsTable(): Promise<void> {
    return this.#connection.schema.createTable(this.#tableName, (table) => {
      table.uuid('id').primary()
      table.uuid('parent_id').nullable().references('id').inTable(this.#tableName).onDelete('CASCADE')
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
  }

  createLinksTable(): Promise<void> {
    return this.#connection.schema.createTable(this.#linksTableName, (table) => {
      table.uuid('id').primary()
      table.string('attachable_type').notNullable()
      table.string('attachable_id').notNullable()
      table.string('field').notNullable()
      table.string('owner_key', 64).nullable().unique()
      table.integer('position').unsigned().nullable()
      table.uuid('attachment_id').notNullable().references('id').inTable(this.#tableName).onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['attachable_type', 'attachable_id', 'field'])
      table.index(['attachment_id'])
    })
  }

  dropTables(): Promise<void> {
    return this.dropLinksTable().then(() => this.dropBlobsTable())
  }

  dropBlobsTable(): Promise<void> {
    return this.#connection.schema.dropTableIfExists(this.#tableName)
  }

  dropLinksTable(): Promise<void> {
    return this.#connection.schema.dropTableIfExists(this.#linksTableName)
  }
}
