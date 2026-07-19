import type Configure from '@adonisjs/core/commands/configure'
import { fileURLToPath } from 'node:url'

export const stubsRoot = fileURLToPath(new URL('../stubs', import.meta.url))

/**
 * Registers the provider and migration commands. The application defines
 * its own storage and queue integrations in config/attachment.ts.
 */
export async function configure(command: Configure): Promise<void> {
  const codemods = await command.createCodemods()

  await codemods.makeUsingStub(stubsRoot, 'config/attachment.stub', {})

  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@jrmc/adonis-attachment/attachment_provider')
    rcFile.addCommand('@jrmc/adonis-attachment/commands')
  })
}
