/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'
import {
  AttachmentService,
  MemoryAttachmentQueue,
  createAttachmentProcessor,
  defineConfig,
  type Attachment,
  type AttachmentJob,
  type AttachmentStore,
  type AttachmentStorage,
} from '../index.js'

const file: Attachment = {
  id: 'custom-file',
  disk: 'custom',
  path: 'avatar.txt',
  name: 'avatar.txt',
  originalName: 'avatar.txt',
  extname: 'txt',
  mimeType: 'text/plain',
  size: 1,
}
const storage: AttachmentStorage = {
  async write() {},
  async read() {
    return new Uint8Array([1])
  },
  async remove() {},
}

test.group('configured attachment stores', () => {
  test('uses one custom store for memory jobs and freshly created external workers', async ({
    assert,
  }) => {
    const variants: string[] = []
    const metadata: unknown[] = []
    const events: string[] = []
    const failures: unknown[] = []
    let imports = 0
    let service: AttachmentService
    const store: AttachmentStore = {
      repository: {
        async findById(id) {
          return id === file.id ? file : null
        },
      },
      metadataPersister: {
        async persistMetadata(attachment, values) {
          metadata.push([attachment.id, values])
        },
      },
      variants(attachments, converters, context) {
        assert.equal(attachments, service)
        assert.deepEqual(context, {
          defaultDisk: 'custom',
          defaults: { meta: true },
          variant: { basePath: 'previews' },
        })
        return {
          async generate(request) {
            assert.deepEqual(await converters.keys(), ['thumbnail'])
            variants.push(request.attachment.id)
          },
        }
      },
    }
    const app = {
      container: {
        async make(binding: string): Promise<unknown> {
          if (binding === 'jrmc.attachment') return service
          if (binding === 'jrmc.attachment.store') return resolved.store
          if (binding === 'jrmc.attachment.storeContext') return resolved.storeContext
          if (binding === 'jrmc.attachment.converters') return resolved.converters
          throw new Error(`Unexpected binding: ${binding}`)
        },
      },
    }
    const resolved = await defineConfig({
      storage,
      defaultDisk: 'custom',
      defaults: { meta: true },
      variant: { basePath: 'previews' },
      queue: {
        driver: 'memory',
        onFailure(_job, error) {
          failures.push(error)
        },
      },
      async store(receivedApp, context) {
        imports++
        assert.equal(receivedApp, app)
        assert.equal(context.defaultDisk, 'custom')
        return store
      },
      converters: { thumbnail: {} },
      media: {
        metadata: [
          {
            async extract() {
              return { inspected: true }
            },
          },
        ],
        metadataPolicy: { mode: 'deferred' },
      },
      events: {
        emit(name) {
          events.push(name)
        },
      },
    }).resolver(app as never)
    assert.equal(imports, 1)
    assert.equal(resolved.store, store)
    service = new AttachmentService(resolved)
    const jobs: AttachmentJob[] = [
      { type: 'generate-variants', attachmentId: file.id, variantKeys: ['thumbnail'] },
      { type: 'extract-metadata', attachmentId: file.id, attachment: file },
    ]
    for (const job of jobs) await resolved.queue.enqueue(job)
    await (resolved.queue as MemoryAttachmentQueue).drain()
    assert.deepEqual(failures, [])
    // Recreate the processor without passing a repository or any persistence services.
    for (const job of jobs)
      await createAttachmentProcessor(app as never, { events: resolved.events! }).process(job)
    assert.deepEqual(variants, [file.id, file.id])
    assert.deepEqual(metadata, [
      [file.id, { inspected: true }],
      [file.id, { inspected: true }],
    ])
    assert.include(events, 'attachment:variant_completed')
  })

  test('allows a read-only store and reports unsupported processing explicitly', async ({
    assert,
  }) => {
    const store: AttachmentStore = {
      repository: {
        async findById() {
          return file
        },
      },
    }
    const resolved = await defineConfig({ storage, store }).resolver({} as never)
    assert.equal(resolved.repository, store.repository)
    const processor = createAttachmentProcessor({} as never, { store })
    await assert.rejects(
      () => processor.process({ type: 'generate-variants', attachmentId: file.id }),
      /does not support variant persistence/,
    )
    await assert.rejects(
      () =>
        processor.process({ type: 'extract-metadata', attachmentId: file.id, attachment: file }),
      /does not support deferred metadata persistence/,
    )
    await assert.rejects(
      () =>
        defineConfig({ storage, store, media: { metadataPolicy: { mode: 'deferred' } } }).resolver(
          {} as never,
        ),
      /requires store.metadataPersister/,
    )
    await assert.rejects(
      () =>
        defineConfig({ storage, store, defaults: { variants: ['thumbnail'] } }).resolver(
          {} as never,
        ),
      /requires a store with variant persistence/,
    )
  })

  test('does not fall back to a bare ID when the custom store cannot resolve contextual references', async ({
    assert,
  }) => {
    let reads = 0
    const store: AttachmentStore = {
      repository: {
        async findById() {
          reads++
          return file
        },
      },
    }
    await assert.rejects(
      () =>
        createAttachmentProcessor({} as never, { store }).process({
          type: 'generate-variants',
          attachmentId: file.id,
          reference: { version: 1, adapter: 'custom', id: file.id },
        }),
      /reference-capable store repository/,
    )
    assert.equal(reads, 0)
  })

  test('lets a custom handler override store processing even with configured variants', async ({
    assert,
  }) => {
    const processed: AttachmentJob[] = []
    const resolved = await defineConfig({
      storage,
      store: false,
      defaults: { variants: ['thumbnail'] },
      jobHandler: () => async (job: AttachmentJob) => {
        processed.push(job)
      },
    }).resolver({} as never)
    await resolved.queue.enqueue({ type: 'generate-variants', attachmentId: file.id })
    await (resolved.queue as MemoryAttachmentQueue).drain()
    assert.lengthOf(processed, 1)
  })

  test('preserves application-owned processing for direct queues without a store', async ({
    assert,
  }) => {
    const processed: AttachmentJob[] = []
    const queue = {
      async enqueue(job: AttachmentJob) {
        processed.push(job)
      },
    }
    const resolved = await defineConfig({
      storage,
      store: false,
      defaults: { variants: ['thumbnail'] },
      queue,
    }).resolver({} as never)
    assert.equal(resolved.queue, queue)
    await resolved.queue.enqueue({ type: 'generate-variants', attachmentId: file.id })
    assert.lengthOf(processed, 1)
  })

  test('rejects malformed stores and removed configuration keys instead of silently ignoring them', async ({
    assert,
  }) => {
    for (const store of [
      {},
      true,
      () => undefined,
      { repository: {} },
      { repository: { findById() {} }, variants: true },
    ]) {
      await assert.rejects(
        () => defineConfig({ storage, store } as never).resolver({} as never),
        /[Ss]tore/,
      )
    }
    for (const key of ['integrations', 'repository', 'processor']) {
      await assert.rejects(
        () => defineConfig({ storage, [key]: {} } as never).resolver({} as never),
        /has been replaced by store/,
      )
    }
    await assert.rejects(
      () =>
        defineConfig({ storage, media: { metadataPersister: {} } } as never).resolver({} as never),
      /moved to store.metadataPersister/,
    )
    await assert.rejects(
      () =>
        defineConfig({
          storage,
          store: {
            repository: {
              async findById() {
                return null
              },
            },
            persistence: { isScoped: false },
          },
        } as never).resolver({} as never),
      /complete transaction capability/,
    )
  })
})
