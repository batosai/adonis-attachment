/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { configProvider } from '@adonisjs/core'
import { test } from '@japa/runner'

import {
  AdonisDriveStorage,
  AttachmentJobProcessor,
  defineConfig,
  MemoryAttachmentQueue,
  type AttachmentJob,
  type AttachmentQueue,
  type AttachmentStorage,
} from '../index.js'

test.group('defineConfig', () => {
  test('uses the default disk resolved from Drive config', async ({ assert }) => {
    const disks: string[] = []
    const drive = {
      use(disk?: string) {
        disks.push(disk ?? 'default')
        return {
          async put() {},
          async getBytes() {
            return new Uint8Array()
          },
          async delete() {},
        }
      },
    }
    const config = defineConfig({
      storage: AdonisDriveStorage.fromApp,
    })

    const resolved = await config.resolver({
      config: {
        get(binding: string) {
          assert.equal(binding, 'drive')
          return configProvider.create(async () => ({ config: { default: 's3' } }))
        },
      },
      container: {
        async make(binding: string) {
          assert.equal(binding, 'drive.manager')
          return drive
        },
      },
    } as never)

    assert.equal(resolved.defaultDisk, 's3')

    await resolved.storage.write({
      disk: resolved.defaultDisk,
      path: 'attachments/avatar.png',
      body: new Uint8Array(),
      mimeType: 'image/png',
    })

    assert.deepEqual(disks, ['s3'])
  })

  test('uses fs when storage does not define a default disk', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }

    const resolved = await defineConfig({ storage }).resolver({} as never)

    assert.equal(resolved.defaultDisk, 'fs')
  })

  test('resolves direct storage and queue integrations', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const queue: AttachmentQueue = {
      async enqueue(_job: AttachmentJob) {},
    }
    const config = defineConfig({ defaultDisk: 'public', storage, queue })

    const resolved = await config.resolver({} as never)

    assert.equal(resolved.defaultDisk, 'public')
    assert.equal(resolved.storage, storage)
    assert.equal(resolved.queue, queue)
    assert.deepEqual(resolved.route, { path: '/attachments/:id' })
  })

  test('resolves integrations from the application at boot time', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const queue: AttachmentQueue = {
      async enqueue(_job: AttachmentJob) {},
    }
    const app = { marker: 'application' }
    const config = defineConfig({
      defaultDisk: 'public',
      storage(resolvedApp) {
        assert.equal(resolvedApp, app)
        return storage
      },
      async queue(resolvedApp) {
        assert.equal(resolvedApp, app)
        return queue
      },
    })

    const resolved = await config.resolver(app as never)

    assert.equal(resolved.storage, storage)
    assert.equal(resolved.queue, queue)
  })

  test('uses the in-memory queue by default', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const config = defineConfig({ defaultDisk: 'public', storage, queueConcurrency: 2 })

    const resolved = await config.resolver({} as never)

    assert.instanceOf(resolved.queue, MemoryAttachmentQueue)
  })

  test('allows applications to disable or prefix the read route', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }

    const disabled = await defineConfig({
      defaultDisk: 'public',
      storage,
      route: false,
    }).resolver({} as never)
    const prefixed = await defineConfig({
      defaultDisk: 'public',
      storage,
      route: { prefix: '/media/files/' },
    }).resolver({} as never)

    assert.isFalse(disabled.route)
    assert.deepEqual(prefixed.route, { path: '/media/files/:id' })
  })

  test('preserves source-manager options', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const sources = { maxBytes: 10 * 1024 * 1024 }

    const resolved = await defineConfig({ defaultDisk: 'public', storage, sources }).resolver({} as never)

    assert.equal(resolved.sources, sources)
  })

  test('preserves attachment persistence defaults', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const defaults = { folder: 'attachments', variants: ['thumbnail'] as const }

    const resolved = await defineConfig({ defaultDisk: 'public', storage, defaults }).resolver({} as never)

    assert.equal(resolved.defaults, defaults)
  })

  test('resolves media metadata extractors at application boot', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const extractors = [{ async extract() { return { width: 800 } } }]
    const app = { marker: 'application' }

    const resolved = await defineConfig({
      defaultDisk: 'public',
      storage,
      media: {
        metadata(resolvedApp) {
          assert.equal(resolvedApp, app)
          return extractors
        },
      },
    }).resolver(app as never)

    assert.equal(resolved.metadataExtractors, extractors)
  })

  test('wraps named v5-style converter declarations in a lazy registry', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    let imports = 0
    const resolved = await defineConfig({
      defaultDisk: 'public',
      storage,
      converters: {
        thumbnail: {
          width: 320,
          converter: async () => {
            imports += 1
            return {
              default: {
                key: 'ignored',
                async convert() {
                  return undefined
                },
              },
            }
          },
        },
      },
    }).resolver({} as never)

    assert.equal(imports, 0)
    assert.deepEqual(await resolved.converters?.keys(), ['thumbnail'])
    assert.equal((await resolved.converters?.get('thumbnail'))?.key, 'thumbnail')
    assert.equal(imports, 1)
  })

  test('derives Lucid link table names from one configured blob table', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }

    const resolved = await defineConfig({
      defaultDisk: 'public',
      storage,
      integrations: {
        lucid: { tableName: 'media_attachments' },
      },
    }).resolver({} as never)

    assert.deepEqual(resolved.integrations, {
      lucid: {
        tableName: 'media_attachments',
        linksTableName: 'media_attachment_links',
      },
    })
  })

  test('rejects invalid route prefixes', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }

    await assert.rejects(
      () => defineConfig({ defaultDisk: 'public', storage, route: { prefix: 'attachments/:id' } }).resolver({} as never),
      'Attachment route prefix must start with "/" and cannot contain parameters'
    )
  })

  test('uses the configured processor as the memory queue handler', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const processed: AttachmentJob[] = []
    const processor = new AttachmentJobProcessor({
      attachments: {
        async findById() {
          return null
        },
      },
      variants: {
        async generate() {},
      },
    })
    processor.process = async (job) => {
      processed.push(job)
    }
    const config = defineConfig({ defaultDisk: 'public', storage, processor })
    const resolved = await config.resolver({} as never)

    await resolved.queue.enqueue({ type: 'generate-variants', attachmentId: 'attachment-id' })
    await (resolved.queue as MemoryAttachmentQueue).drain()

    assert.deepEqual(processed, [{ type: 'generate-variants', attachmentId: 'attachment-id' }])
  })
})
