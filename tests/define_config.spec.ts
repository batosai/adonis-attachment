import { test } from '@japa/runner'

import {
  AttachmentJobProcessor,
  defineConfig,
  MemoryAttachmentQueue,
  type AttachmentJob,
  type AttachmentQueue,
  type AttachmentStorage,
} from '../index.js'

test.group('defineConfig', () => {
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
