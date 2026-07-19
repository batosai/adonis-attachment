/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { stubsRoot } from './stubs/main.js'

import type Configure from '@adonisjs/core/commands/configure'

export async function configure(command: Configure): Promise<void> {
  const codemods = await command.createCodemods()

  /**
   * Create default config file
   */
  await codemods.makeUsingStub(stubsRoot, 'config/attachment.stub', {})

  /**
   * Register provider
   */
  await codemods.updateRcFile((rcFile) => {
    rcFile.addProvider('@jrmc/adonis-attachment/attachment_provider')
    rcFile.addCommand('@jrmc/adonis-attachment/commands')
  })
}
