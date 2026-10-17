/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Knex } from 'knex'
import { resolveAttachmentTableNames } from './attachment_table_names.js'

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
    const tables = resolveAttachmentTableNames(options.tableName)
    this.#tableName = tables.tableName
    this.#linksTableName = tables.linksTableName
  }

  createTables(): Promise<void> {
    return this.createBlobsTable().then(() => this.createLinksTable())
  }

  createBlobsTable(): Promise<void> {
    return this.#connection.schema.createTable(this.#tableName, (table) => {
      table.uuid('id').primary()
      const parentForeignKey = table.uuid('parent_id').nullable().references('id').inTable(this.#tableName)
      parentForeignKey.onDelete(this.#isMssql ? 'NO ACTION' : 'CASCADE')
      table.string('variant_key').nullable()
      table.string('disk').notNullable()
      table.string('path').notNullable()
      table.string('name').notNullable()
      table.string('original_name').notNullable()
      table.string('mime_type').notNullable()
      table.string('extname').notNullable()
      table.bigInteger('size').unsigned().notNullable()
      table.string('blurhash').nullable()
      // Knex maps Oracle JSON to VARCHAR2(4000), too small for extracted metadata.
      if (this.#isOracle) table.text('metadata').nullable()
      else table.json('metadata').nullable()
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
      const attachmentForeignKey = table.uuid('attachment_id').notNullable().references('id').inTable(this.#tableName)
      if (!this.#isOracle) attachmentForeignKey.onDelete(this.#isMssql ? 'NO ACTION' : 'RESTRICT')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['attachable_type', 'attachable_id', 'field'], `${this.#linksTableName}_owner_index`)
      table.index(['attachment_id'])
    })
  }

  /** Adds the nullable blurhash column to a table created by an earlier v6 schema. */
  addBlurhashColumn(): Promise<void> {
    return this.#connection.schema.table(this.#tableName, (table) => {
      table.string('blurhash').nullable()
    })
  }

  /** Removes the blurhash column when rolling back a schema upgrade. */
  dropBlurhashColumn(): Promise<void> {
    return this.#connection.schema.table(this.#tableName, (table) => {
      table.dropColumn('blurhash')
    })
  }

  /** Upgrade older v6 schemas so referenced blobs cannot be deleted by cascade. */
  protectReferencedBlobs(): Promise<void> {
    return this.#setLinkDeleteRule('RESTRICT')
  }

  /** Roll back protectReferencedBlobs without dropping attachment data. */
  restoreCascadingBlobDeletion(): Promise<void> {
    return this.#setLinkDeleteRule('CASCADE')
  }

  #setLinkDeleteRule(rule: 'RESTRICT' | 'CASCADE'): Promise<void> {
    return this.#connection.schema.alterTable(this.#linksTableName, (table) => {
      table.dropForeign(['attachment_id'])
      const foreignKey = table.foreign('attachment_id').references('id').inTable(this.#tableName)
      if (rule === 'CASCADE' || !this.#isOracle) foreignKey.onDelete(rule === 'RESTRICT' && this.#isMssql ? 'NO ACTION' : rule)
    })
  }

  /** Oracle restricts referenced deletes by default and has no RESTRICT keyword. */
  get #isOracle(): boolean {
    return ['oracle', 'oracledb'].includes(this.#connection.client.config.client)
  }

  get #isMssql(): boolean {
    return this.#connection.client.config.client === 'mssql'
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
