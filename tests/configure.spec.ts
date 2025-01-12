/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { FileSystem } from '@japa/file-system'

import { test } from '@japa/runner'
import Configure from '@adonisjs/core/commands/configure'
import { IgnitorFactory } from '@adonisjs/core/factories'

import { BASE_URL } from './helpers/index.js'


async function setupFakeAdonisProject(fs: FileSystem) {
  await Promise.all([
    fs.create('.env', ''),
    fs.createJson('tsconfig.json', {}),
    fs.create('adonisrc.ts', `export default defineConfig({})`),
  ])
}

async function setupApp() {
  const ignitor = new IgnitorFactory()
    .withCoreProviders()
    .withCoreConfig()
    .create(BASE_URL, {
      importer: (filePath) => {
        if (filePath.startsWith('./') || filePath.startsWith('../')) {
          return import(new URL(filePath, BASE_URL).href)
        }

        return import(filePath)
      },
    })

  const app = ignitor.createApp('web')
  await app.init()
  await app.boot()

  const ace = await app.container.make('ace')
  ace.ui.switchMode('raw')

  return { ace, app }
}

test.group('configure', (group) => {
  group.tap((t) => t.timeout(20_000))
  group.each.setup(async ({ context }) => setupFakeAdonisProject(context.fs))

  test('add provider, config file, and command', async ({ assert }) => {
    const { ace } = await setupApp()

    const command = await ace.create(Configure, ['../../configure.js'])
    await command.exec()

    command.assertSucceeded()

    await assert.fileExists('config/attachment.ts')
    await assert.fileExists('adonisrc.ts')
    await assert.fileContains('adonisrc.ts', '@jrmc/adonis-attachment/attachment_provider')
    await assert.fileContains('adonisrc.ts', '@jrmc/adonis-attachment/commands')
  })
})

