import type Configure from '@adonisjs/core/commands/configure'

/**
 * Registers the provider and migration commands. The application defines
 * its own storage and queue integrations in config/attachment.ts.
 */
export async function configure(command: Configure): Promise<void> {
  const codemods = await command.createCodemods()

  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@jrmc/adonis-attachment/attachment_provider')
    rcFile.addCommand('@jrmc/adonis-attachment/commands/make/attachments_table')
    rcFile.addCommand('@jrmc/adonis-attachment/commands/make/attachment_v5_migration')
  })
}
