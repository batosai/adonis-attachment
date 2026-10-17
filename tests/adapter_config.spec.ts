import { test } from '@japa/runner'
import { configProvider } from '@adonisjs/core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defineConfig, LocalFileStorage, AdonisDriveStorage, MemoryAttachmentQueue,
  AdonisAttachmentQueue,
  type AttachmentStorage, type AttachmentQueueContext, type AttachmentJob,
} from '../index.js'

const storage: AttachmentStorage = {
  defaultDisk: 'public',
  async write() {},
  async read() { return new Uint8Array() },
  async remove() {},
}

const job: AttachmentJob = { type: 'generate-variants', attachmentId: 'original' }

test.group('Common adapter configuration', () => {
  test('resolves factories in order with role-specific context and a usable store processor', async ({ assert }) => {
    const order: string[] = []
    const defaults = { folder: 'uploads' }
    const variant = { basePath: 'variants' }
    let context: AttachmentQueueContext | undefined
    const app = {}
    const resolved = await defineConfig({
      defaults, variant,
      async storage(application, received) {
        assert.strictEqual(application, app)
        assert.isUndefined(received.defaultDisk)
        assert.strictEqual(received.defaults, defaults)
        assert.strictEqual(received.variant, variant)
        order.push('storage')
        return storage
      },
      store(application, received) {
        assert.strictEqual(application, app)
        assert.equal(received.defaultDisk, 'public')
        order.push('store')
        return { repository: { async findById(id) { order.push(id); return null } } }
      },
      queue(application, received) {
        assert.strictEqual(application, app)
        assert.equal(received.defaultDisk, 'public')
        assert.strictEqual(received.defaults, defaults)
        assert.strictEqual(received.variant, variant)
        context = received
        order.push('queue')
        return { async enqueue(payload) { await received.handler!(payload) } }
      },
    }).resolver(app as never)
    assert.deepEqual(order, ['storage', 'store', 'queue'])
    assert.isFunction(context?.handler)
    await assert.rejects(() => resolved.queue.enqueue(job))
    assert.deepEqual(order, ['storage', 'store', 'queue', 'original'])
  })

  test('passes explicit defaultDisk to every factory and lets a custom factory use jobHandler', async ({ assert }) => {
    const processed: AttachmentJob[] = []
    const resolved = await defineConfig({
      defaultDisk: 's3',
      storage(_app, context) { assert.equal(context.defaultDisk, 's3'); return storage },
      jobHandler: () => async (payload: AttachmentJob) => { processed.push(payload) },
      queue(_app, context) {
        assert.equal(context.defaultDisk, 's3')
        return { async enqueue(payload) { await context.handler!(payload) } }
      },
    }).resolver({} as never)
    await resolved.queue.enqueue(job)
    assert.deepEqual(processed, [job])
  })

  test('native memory factories use the configured handler in direct and named forms', async ({ assert }) => {
    const processed: AttachmentJob[] = []
    for (const queue of [
      MemoryAttachmentQueue.fromApp,
      MemoryAttachmentQueue.configure({ concurrency: 2 }),
      { default: 'local' as const, connections: { local: MemoryAttachmentQueue.configure() } },
    ]) {
      const resolved = await defineConfig({ storage, queue,
        jobHandler: () => async (payload: AttachmentJob) => { processed.push(payload) },
      }).resolver({} as never)
      await resolved.queue.enqueue(job)
      await (resolved.queue as MemoryAttachmentQueue).drain()
    }
    assert.deepEqual(processed, [job, job, job])
  })

  test('memory factories retain failure reporting and missing-handler rejection', async ({ assert }) => {
    const failures: unknown[] = []
    const error = new Error('processing failed')
    const queue = MemoryAttachmentQueue.configure({ onFailure: (_job, failure) => { failures.push(failure) } })({} as never, {
      defaultDisk: 'fs', handler: async () => { throw error },
    })
    await queue.enqueue(job)
    await queue.drain()
    assert.deepEqual(failures, [error])
    const resolved = await defineConfig({ storage, queue: MemoryAttachmentQueue.fromApp }).resolver({} as never)
    await assert.rejects(() => resolved.queue.enqueue(job), 'The in-memory attachment queue requires a configured store or jobHandler')
    await assert.rejects(() => defineConfig({ storage, defaults: { variants: ['thumbnail'] }, queue: MemoryAttachmentQueue.configure() }).resolver({} as never),
      'Attachment defaults.variants requires a store with variant persistence or a custom jobHandler')
  })

  test('preserves standalone memory handlers with application-owned variant persistence', async ({ assert }) => {
    const processed: AttachmentJob[] = []
    const standalone = new MemoryAttachmentQueue({ handler: async (payload) => { processed.push(payload) } })
    for (const queue of [standalone, () => standalone]) {
      const resolved = await defineConfig({ storage, defaults: { variants: ['thumbnail'] }, queue }).resolver({} as never)
      assert.strictEqual(resolved.queue, standalone)
      await resolved.queue.enqueue(job)
      await standalone.drain()
    }
    assert.deepEqual(processed, [job, job])
  })

  test('local configure derives the app directory and preserves disk and public URL options', async ({ assert }) => {
    const location = await mkdtemp(join(tmpdir(), 'attachment-adapter-'))
    try {
      const resolved = await defineConfig({ storage: LocalFileStorage.configure({ disk: 'uploads', baseUrl: 'https://example.test/files' }) }).resolver({
        makePath(path: string) { assert.equal(path, 'storage/attachments'); return location },
      } as never)
      assert.equal(resolved.defaultDisk, 'uploads')
      const file = { disk: 'uploads', path: 'avatar.png' }
      await resolved.storage.write({ ...file, body: new Uint8Array([1, 2]), mimeType: 'image/png' })
      assert.deepEqual(await resolved.storage.read(file), new Uint8Array([1, 2]))
      assert.equal(await resolved.storage.getUrl?.(file), 'https://example.test/files/avatar.png')
    } finally { await rm(location, { recursive: true, force: true }) }
  })

  test('Drive configure overrides its default disk and Adonis configure dispatches to the selected queue', async ({ assert }) => {
    const disks: string[] = []
    const calls: string[] = []
    const resolved = await defineConfig({
      storage: AdonisDriveStorage.configure({ disk: 'uploads' }),
      queue: AdonisAttachmentQueue.configure({ queueName: 'media', job: {
        dispatch(payload) {
          assert.deepEqual(payload, job)
          return { toQueue(name) { calls.push(name); return this }, async run() { calls.push('run') } }
        },
      } }),
    }).resolver({
      config: { get() { return configProvider.create(async () => ({ config: { default: 'fs' } })) } },
      container: { async make() { return { use(disk: string) { disks.push(disk); return { async delete() {} } } } } },
    } as never)
    assert.equal(resolved.defaultDisk, 'uploads')
    await resolved.storage.remove({ disk: resolved.defaultDisk, path: 'file' })
    assert.deepEqual(disks, ['uploads'])
    await resolved.queue.enqueue(job)
    assert.deepEqual(calls, ['media', 'run'])
  })
})
