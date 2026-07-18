import { test } from '@japa/runner'

import { defineConfig, type AttachmentJob, type AttachmentQueue, type AttachmentStorage } from '../index.js'

test.group('defineConfig', () => {
  test('resolves direct storage and queue integrations', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
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
  })

  test('resolves integrations from the application at boot time', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
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
})
