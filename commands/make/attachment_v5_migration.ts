/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { BaseCommand } from '@adonisjs/core/ace'

import { stubsRoot } from '../../stubs/main.js'
import { createLegacyAttachmentMigrationStubState } from '../../src/integrations/lucid/migrations/legacy/legacy_attachment_migration_stub.js'

export default class MakeAttachmentV5Migration extends BaseCommand {
  static commandName = 'make:attachment-v5-migration'
  static description = 'Create a script for migrating v5 attachment JSON values'
  static options = {
    startApp: true,
    allowUnknownFlags: true,
  }

  async run(): Promise<void> {
    const flags = this.parsed.flags as { folder?: string; disk?: string }
    const folder = flags.folder ?? 'database/scripts'
    const state = createLegacyAttachmentMigrationStubState({
      directory: this.app.makePath(folder),
      ...(flags.disk ? { defaultDisk: flags.disk } : {}),
    })
    const codemods = await this.createCodemods()

    await codemods.makeUsingStub(stubsRoot, 'migrations/legacy_attachment_migration.stub', state)
    this.logger.success(`Created ${state.destination}`)
  }
}
