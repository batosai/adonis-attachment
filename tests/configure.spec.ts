import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { test } from '@japa/runner'

import { configure, stubsRoot } from '../configure.js'

test.group('configure', () => {
  test('generates the default attachment config and registers package integrations', async ({ assert }) => {
    const stubs: Array<{ root: string; path: string; state: Record<string, unknown> }> = []
    const providers: string[] = []
    const commands: string[] = []

    await configure({
      async createCodemods() {
        return {
          async makeUsingStub(root: string, path: string, state: Record<string, unknown>) {
            stubs.push({ root, path, state })
          },
          async updateRcFile(callback: (rcFile: { addProvider(value: string): void; addCommand(value: string): void }) => void) {
            callback({
              addProvider(value) {
                providers.push(value)
              },
              addCommand(value) {
                commands.push(value)
              },
            })
          },
        }
      },
    } as never)

    assert.deepEqual(stubs, [{ root: stubsRoot, path: 'config/attachment.stub', state: {} }])
    assert.deepEqual(providers, ['@jrmc/adonis-attachment/attachment_provider'])
    assert.deepEqual(commands, ['@jrmc/adonis-attachment/commands'])
    await access(join(stubsRoot, 'config/attachment.stub'))
    assert.include(await readFile(join(stubsRoot, 'config/attachment.stub'), 'utf8'), 'new AdonisDriveStorage(drive)')
  })
})
