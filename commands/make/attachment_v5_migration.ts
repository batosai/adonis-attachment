import { BaseCommand } from '@adonisjs/core/ace'
import type { AbstractBaseCommand, CommandMetaData } from '@adonisjs/ace/types'

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

/**
 * Compatibility loader for projects configured before the package command
 * loader was introduced.
 */
export async function getMetaData(): Promise<CommandMetaData[]> {
  return [MakeAttachmentV5Migration.serialize()]
}

export async function getCommand(metaData: CommandMetaData): Promise<AbstractBaseCommand | null> {
  return metaData.commandName === MakeAttachmentV5Migration.commandName ? MakeAttachmentV5Migration : null
}
