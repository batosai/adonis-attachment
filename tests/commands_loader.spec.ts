import { test } from '@japa/runner'

import { getCommand, getMetaData } from '../commands/main.js'
import * as legacyAttachmentsTableLoader from '../commands/make/attachments_table.js'
import * as legacyV5MigrationLoader from '../commands/make/attachment_v5_migration.js'

test.group('attachment command loader', () => {
  test('exposes the package commands through the Ace loader contract', async ({ assert }) => {
    const commands = await getMetaData()

    assert.deepEqual(
      commands.map((command) => command.commandName),
      ['make:attachments-table', 'make:attachment-v5-migration']
    )
    assert.isNotNull(await getCommand(commands[0]!))
    assert.isNull(
      await getCommand({
        commandName: 'unknown:command',
        description: '',
        namespace: 'unknown',
        aliases: [],
        flags: [],
        args: [],
        options: {},
      })
    )
  })

  test('supports individual command entries written by early configure runs', async ({ assert }) => {
    const loaders = [legacyAttachmentsTableLoader, legacyV5MigrationLoader]

    for (const loader of loaders) {
      const [command] = await loader.getMetaData()

      assert.exists(command)
      assert.isNotNull(await loader.getCommand(command!))
    }
  })
})
