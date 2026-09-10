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
    '@jrmc/adonis-attachment/events/adonis',
    '@jrmc/adonis-attachment/queues/memory',
    '@jrmc/adonis-attachment/queues/adonis',
    '@jrmc/adonis-attachment/adapters/adonis-drive',
    '@jrmc/adonis-attachment/adapters/local-file',
    '@jrmc/adonis-attachment/media/sharp',
    '@jrmc/adonis-attachment/media/exif',
    '@jrmc/adonis-attachment/media/binaries',
    '@jrmc/adonis-attachment/media/metadata',
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
  const coreExports = await import('@jrmc/adonis-attachment/core')
  const lifecycleSource = await readFile(join(process.cwd(), 'build/src/core/attachment_lifecycle_service.js'), 'utf8')

  assert.isFunction(packageExports.configure)
  assert.property(packageExports, 'attachmentManager')
  assert.property(packageExports, 'attachmentService')
  assert.property(packageExports, 'defineConfig')
  assert.notProperty(packageExports, 'attachment')
  assert.notInclude(rootSource, 'integrations/lucid')
  assert.notInclude(lifecycleSource, '@adonisjs/lucid')
  assert.notInclude(lifecycleSource, 'integrations/lucid')
  assert.isFunction(coreExports.AttachmentLifecycleService)
  assert.strictEqual(coreExports.AttachmentFileCleanupError, lucidExports.AttachmentFileCleanupError)
  assert.isFunction(lucidExports.attachment)
  assert.isFunction(lucidExports.attachments)
  assert.isFunction(lucidExports.attachmentRelation)
  assert.isFunction(lucidExports.attachmentsRelation)
  assert.strictEqual(lucidExports.attachment, lucidExports.attachmentRelation)
  assert.strictEqual(lucidExports.attachments, lucidExports.attachmentsRelation)
  assert.isFunction(lucidExports.createLucidAttachmentProcessor)
})
