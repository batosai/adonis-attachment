import { test } from '@japa/runner'

test('imports every published package entry point', async ({ assert }) => {
  const entryPoints = [
    '@jrmc/adonis-attachment',
    '@jrmc/adonis-attachment/core',
    '@jrmc/adonis-attachment/queues/memory',
    '@jrmc/adonis-attachment/queues/adonis',
    '@jrmc/adonis-attachment/adapters/adonis-drive',
    '@jrmc/adonis-attachment/adapters/local-file',
    '@jrmc/adonis-attachment/lucid',
    '@jrmc/adonis-attachment/attachment_provider',
    '@jrmc/adonis-attachment/configure',
    '@jrmc/adonis-attachment/commands/make/attachments_table',
    '@jrmc/adonis-attachment/commands/make/attachment_v5_migration',
  ]

  const modules = await Promise.all(entryPoints.map((entryPoint) => import(entryPoint)))

  assert.lengthOf(modules, entryPoints.length)
})

test('exports the Ace configure hook from the package root', async ({ assert }) => {
  const packageExports = await import('@jrmc/adonis-attachment')

  assert.isFunction(packageExports.configure)
  assert.property(packageExports, 'attachmentManager')
  assert.isFunction(packageExports.attachment)
})
