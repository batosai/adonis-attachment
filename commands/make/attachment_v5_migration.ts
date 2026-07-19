/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { BaseCommand } from '@adonisjs/core/ace'

import { createLegacyAttachmentMigrationScript } from '../../src/integrations/lucid/create_legacy_attachment_migration_script.js'

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
    const filePath = await createLegacyAttachmentMigrationScript({
      directory: this.app.makePath(folder),
      ...(flags.disk ? { defaultDisk: flags.disk } : {}),
    })

    this.logger.success(`Created ${filePath}`)
  }
}
