import type { AbstractBaseCommand, CommandMetaData } from '@adonisjs/ace/types'

import MakeAttachmentV5Migration from './make/attachment_v5_migration.js'
import MakeAttachmentsTable from './make/attachments_table.js'

const commands = [MakeAttachmentsTable, MakeAttachmentV5Migration]

/**
 * Ace command loader registered from the package configure hook.
 */
export async function getMetaData(): Promise<CommandMetaData[]> {
  return commands.map((command) => command.serialize())
}

export async function getCommand(metaData: CommandMetaData): Promise<AbstractBaseCommand | null> {
  return commands.find((command) => command.commandName === metaData.commandName) ?? null
}
