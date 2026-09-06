import { test } from '@japa/runner'

import {
  AdonisAttachmentQueue,
  AttachmentError,
  defineConfig,
  MemoryAttachmentQueue,
  type AttachmentJob,
  type AttachmentStorage,
} from '../index.js'

const storage: AttachmentStorage = {
  async write() {},
  async read() { return new Uint8Array() },
  async remove() {},
}

test.group('named attachment queues', () => {
  test('runs both job types with the selected memory handler and reports failures', async ({ assert }) => {
    const processed: AttachmentJob[] = []
    const failures: unknown[] = []
    const failure = new Error('processing failed')
    const resolved = await defineConfig({
      storage,
      jobHandler: () => async (job: AttachmentJob) => {
        processed.push(job)
        throw failure
      },
      queue: {
        default: 'local',
        connections: {
          local: {
            driver: 'memory',
            concurrency: 2,
            onFailure: (_job, error) => { failures.push(error) },
          },
          unused: () => { throw new Error('must not initialize') },
        },
      },
    }).resolver({} as never)

    const original = {
      id: 'original', disk: 'fs', path: 'image.png', name: 'image.png',
      originalName: 'image.png', mimeType: 'image/png', extname: 'png', size: 1,
    }
    const jobs: AttachmentJob[] = [
      { type: 'generate-variants', attachmentId: original.id },
      { type: 'extract-metadata', attachmentId: original.id, attachment: original },
    ]
    for (const job of jobs) await resolved.queue.enqueue(job)
    await (resolved.queue as MemoryAttachmentQueue).drain()
    assert.deepEqual(processed, jobs)
    assert.deepEqual(failures, [failure, failure])
  })

  test('initializes only the selected factory at boot and passes the application', async ({ assert }) => {
    const app = {}
    let calls = 0
    const queue = { async enqueue() {} }
    const config = defineConfig({
      storage,
      queue: {
        default: 'custom',
        connections: {
          custom: async (application) => {
            assert.strictEqual(application, app)
            calls++
            return queue
          },
          unused: () => { throw new Error('must not initialize') },
        },
      },
    })
    assert.equal(calls, 0)
    const resolved = await config.resolver(app as never)
    assert.equal(calls, 1)
    assert.strictEqual(resolved.queue, queue)
  })

  test('supports a named queue instance', async ({ assert }) => {
    const queue = { async enqueue() {} }
    const resolved = await defineConfig({
      storage, queue: { default: 'custom', connections: { custom: queue } },
    }).resolver({} as never)
    assert.strictEqual(resolved.queue, queue)
  })

  test('selects the Adonis driver and preserves its destination', async ({ assert }) => {
    const calls: string[] = []
    const resolved = await defineConfig({
      storage,
      queue: {
        default: 'background',
        connections: {
          memory: { driver: 'memory', concurrency: 0 },
          background: {
            driver: 'adonis', queueName: 'attachments',
            job: {
              dispatch() {
                return {
                  toQueue(name) { calls.push(name); return this },
                  async run() { calls.push('run') },
                }
              },
            },
          },
        },
      },
    }).resolver({} as never)
    assert.instanceOf(resolved.queue, AdonisAttachmentQueue)
    await resolved.queue.enqueue({ type: 'generate-variants', attachmentId: 'original' })
    assert.deepEqual(calls, ['attachments', 'run'])
  })

  test('rejects invalid defaults at boot without initializing integrations', async ({ assert }) => {
    const configurations = [
      { default: 'missing', connections: { memory: { driver: 'memory' } } },
      { default: 'memory', connections: {} },
      { connections: { memory: { driver: 'memory' } } },
      { default: 'memory' },
      { default: 'memory', connections: null },
      { default: 'memory', connections: [] },
      { default: 'memory', connections: { memory: undefined } },
      { default: 'toString', connections: {} },
      { default: '', connections: { '': { driver: 'memory' } } },
    ]
    for (const queue of configurations) {
      try {
        await defineConfig({
          storage: () => { throw new Error('must validate before initialization') },
          queue: queue as never,
        }).resolver({} as never)
        assert.fail('Expected invalid configuration to fail')
      } catch (error) {
        assert.instanceOf(error, AttachmentError)
        assert.equal((error as AttachmentError).code, 'E_INVALID_ATTACHMENT_CONFIG')
        assert.include((error as Error).message, 'Invalid attachment queue default')
      }
    }
  })

  test('rejects invalid selected connections instead of falling back to memory', async ({ assert }) => {
    for (const connection of [null, 42, false, {}, { driver: 'unknown' }, async () => undefined]) {
      await assert.rejects(() => defineConfig({
        storage,
        queue: { default: 'selected', connections: { selected: connection } } as never,
      }).resolver({} as never))
    }
  })

  test('preserves the missing processor error for a named memory queue without Lucid', async ({ assert }) => {
    const resolved = await defineConfig({
      storage,
      queue: { default: 'memory', connections: { memory: { driver: 'memory' } } },
    }).resolver({} as never)
    await assert.rejects(
      () => resolved.queue.enqueue({ type: 'generate-variants', attachmentId: 'original' }),
      'The in-memory attachment queue requires a processor or jobHandler when Lucid is not available'
    )
  })
})
