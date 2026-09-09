/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { Database } from '@adonisjs/lucid/database'

import { AttachmentModel } from '../../src/integrations/lucid/models/attachment_model.js'
import { AttachmentLinkModel } from '../../src/integrations/lucid/models/attachment_link_model.js'
import { AttachmentSchemaService } from '../../src/integrations/lucid/schema/attachment_schema_service.js'

export async function createLucidTestDatabase(options: { filename?: string; createSchema?: boolean } = {}): Promise<Database> {
  const database = new Database(
    {
      connection: 'sqlite',
      connections: {
        sqlite: {
          client: 'better-sqlite3',
          connection: { filename: options.filename ?? ':memory:' },
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

  if (options.createSchema !== false) {
    await new AttachmentSchemaService(database.connection().getWriteClient()).createTables()
  }

  return database
}
