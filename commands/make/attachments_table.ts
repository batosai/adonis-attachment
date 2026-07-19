import { BaseCommand } from '@adonisjs/core/ace'

import { createAttachmentsMigrationFile } from '../../src/integrations/lucid/create_attachments_migration_file.js'

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
    const filePath = await createAttachmentsMigrationFile({
      directory: this.app.makePath(folder),
      tableName,
    })

    this.logger.success(`Created ${filePath}`)
  }
}
