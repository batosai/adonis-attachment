/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { test } from '@japa/runner'

test('imports every published package entry point', async ({ assert }) => {
  const entryPoints = [
    '@jrmc/adonis-attachment',
    '@jrmc/adonis-attachment/core',
    '@jrmc/adonis-attachment/queues/memory',
    '@jrmc/adonis-attachment/queues/adonis',
    '@jrmc/adonis-attachment/adapters/adonis-drive',
    '@jrmc/adonis-attachment/adapters/local-file',
    '@jrmc/adonis-attachment/media/sharp',
    '@jrmc/adonis-attachment/media/binaries',
    '@jrmc/adonis-attachment/converters/converter',
    '@jrmc/adonis-attachment/converters/autodetect_converter',
    '@jrmc/adonis-attachment/lucid',
    '@jrmc/adonis-attachment/attachment_provider',
    '@jrmc/adonis-attachment/configure',
    '@jrmc/adonis-attachment/commands/make/attachments_table',
    '@jrmc/adonis-attachment/commands/make/attachment_v5_migration',
    '@jrmc/adonis-attachment/commands/make/converter',
  ]

  const modules = await Promise.all(entryPoints.map((entryPoint) => import(entryPoint)))

  assert.lengthOf(modules, entryPoints.length)
})

test('keeps Lucid exports out of the package root', async ({ assert }) => {
  const packageExports = await import('@jrmc/adonis-attachment')
  const rootSource = await readFile(join(process.cwd(), 'build/index.js'), 'utf8')
  const lucidExports = await import('@jrmc/adonis-attachment/lucid')

  assert.isFunction(packageExports.configure)
  assert.property(packageExports, 'attachmentManager')
  assert.property(packageExports, 'defineConfig')
  assert.notProperty(packageExports, 'attachment')
  assert.notInclude(rootSource, 'integrations/lucid')
  assert.isFunction(lucidExports.attachment)
  assert.isFunction(lucidExports.attachmentRelation)
})
