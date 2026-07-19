/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { BaseCommand } from '@adonisjs/core/ace'

import { stubsRoot } from '../../stubs/main.js'
import { createAttachmentsTableStubState } from '../../src/integrations/lucid/attachments_table_stub.js'

export default class MakeAttachmentsTable extends BaseCommand {
  static commandName = 'make:attachments-table'
  static description = 'Create the polymorphic attachments table migration'
  static options = {
    startApp: true,
    allowUnknownFlags: true,
  }

  async run(): Promise<void> {
    const flags = this.parsed.flags as { table?: string; folder?: string }
    const tableName = flags.table ?? 'attachments'
    const folder = flags.folder ?? 'database/migrations'
    const state = createAttachmentsTableStubState({
      directory: this.app.makePath(folder),
      tableName,
    })
    const codemods = await this.createCodemods()

    await codemods.makeUsingStub(stubsRoot, 'migrations/attachments_table.stub', state)
    this.logger.success(`Created ${state.destination}`)
  }
}
