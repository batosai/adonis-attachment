import { BaseCommand } from '@adonisjs/core/ace'
import type { AbstractBaseCommand, CommandMetaData } from '@adonisjs/ace/types'

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

/**
 * Compatibility loader for projects configured before the package command
 * loader was introduced.
 */
export async function getMetaData(): Promise<CommandMetaData[]> {
  return [MakeAttachmentsTable.serialize()]
}

export async function getCommand(metaData: CommandMetaData): Promise<AbstractBaseCommand | null> {
  return metaData.commandName === MakeAttachmentsTable.commandName ? MakeAttachmentsTable : null
}
