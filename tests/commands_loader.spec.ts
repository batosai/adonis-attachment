import { test } from '@japa/runner'

import { getCommand, getMetaData } from '../commands/main.js'

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
})
