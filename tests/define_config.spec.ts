/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { configProvider } from '@adonisjs/core'
import { writeFile } from 'node:fs/promises'
import { test } from '@japa/runner'

import {
  AdonisDriveStorage,
  AdonisAttachmentQueue,
  AttachmentJobProcessor,
  defineConfig,
  MemoryAttachmentQueue,
  type AttachmentJob,
  type AttachmentQueue,
  type AttachmentStorage,
} from '../index.js'
import type { Attachment } from '../src/core/attachment.js'
import type { CommandExecution, CommandRunner } from '../src/media/binaries.js'
import { LucidAttachmentMetadataPersister } from '../src/integrations/lucid/persistence/lucid_attachment_metadata_persister.js'
import { LucidAttachmentRepository } from '../src/integrations/lucid/persistence/lucid_attachment_repository.js'

const pdf: Attachment = {
  id: 'attachment-id',
  disk: 'fs',
  path: 'uploads/report.pdf',
  name: 'report.pdf',
  originalName: 'report.pdf',
  mimeType: 'application/pdf',
  extname: 'pdf',
  size: 3,
}

class FakePdfRunner implements CommandRunner {
  executions: CommandExecution[] = []

  async run(execution: CommandExecution) {
    this.executions.push(execution)
    await writeFile(`${execution.args.at(-1)!}.png`, new Uint8Array([1]))
    return { stdout: new Uint8Array(), stderr: new Uint8Array() }
  }
}

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
    assert.deepEqual(resolved.route, { path: '/attachments/:id/:name?' })
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
    const config = defineConfig({
      defaultDisk: 'public',
      storage,
      queue: { driver: 'memory', concurrency: 2 },
    })

    const resolved = await config.resolver({} as never)

    assert.instanceOf(resolved.queue, MemoryAttachmentQueue)
  })

  test('uses the default Lucid processor with implicit and configured memory queues', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const processed: string[] = []
    const app = {
      container: {
        hasBinding(binding: string) {
          return binding === 'lucid.db'
        },
        async make(binding: string) {
          assert.equal(binding, 'jrmc.attachment')
          return {
            async extractAndPersistMetadata(attachment: Attachment) {
              processed.push(attachment.id)
            },
          }
        },
      },
    }

    for (const queue of [
      undefined,
      { driver: 'memory' as const, concurrency: 2 },
      { default: 'local' as const, connections: { local: { driver: 'memory' as const, concurrency: 2 } } },
    ]) {
      const resolved = await defineConfig({
        storage,
        ...(queue ? { queue } : {}),
      }).resolver(app as never)

      await resolved.queue.enqueue({
        type: 'extract-metadata',
        attachmentId: pdf.id,
        attachment: pdf,
      })
      await (resolved.queue as MemoryAttachmentQueue).drain()
    }

    assert.deepEqual(processed, [pdf.id, pdf.id, pdf.id])
  })

  test('rejects memory jobs without Lucid or a configured processor', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const resolved = await defineConfig({ storage }).resolver({} as never)

    await assert.rejects(
      () =>
        resolved.queue.enqueue({
          type: 'generate-variants',
          attachmentId: pdf.id,
        }),
      'The in-memory attachment queue requires a processor or jobHandler when Lucid is not available'
    )
  })

  test('resolves the Adonis queue driver configuration', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const calls: string[] = []
    const resolved = await defineConfig({
      storage,
      queue: {
        driver: 'adonis',
        queueName: 'attachments',
        job: {
          dispatch() {
            return {
              toQueue(name) {
                calls.push(name)
                return this
              },
              async run() {
                calls.push('run')
              },
            }
          },
        },
      },
    }).resolver({} as never)

    assert.instanceOf(resolved.queue, AdonisAttachmentQueue)
    await resolved.queue.enqueue({ type: 'generate-variants', attachmentId: 'attachment-id' })
    assert.deepEqual(calls, ['attachments', 'run'])
  })

  test('rejects an unknown queue driver at runtime', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }

    await assert.rejects(
      () => defineConfig({
        storage,
        queue: { driver: 'unknown' } as never,
      }).resolver({} as never),
      'Unknown attachment queue driver: unknown'
    )
  })

  test('preserves the configured attachment event emitter', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() { return new Uint8Array() },
      async remove() {},
    }
    const events = { emit() {} }
    let injected: unknown
    const processor = {
      async process() {},
      setEventEmitter(value: unknown) {
        injected = value
      },
    } as never

    const resolved = await defineConfig({ storage, events, processor }).resolver({} as never)

    assert.equal(resolved.events, events)
    assert.equal(injected, events)
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
    assert.deepEqual(prefixed.route, { path: '/media/files/:id/:name?' })
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

  test('registers the default metadata extractors when no override is configured', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }

    const resolved = await defineConfig({ storage }).resolver({} as never)

    assert.lengthOf(resolved.metadataExtractors!, 3)
  })

  test('allows an empty metadata override to disable the default extractors', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }

    const resolved = await defineConfig({ storage, media: { metadata: [] } }).resolver({} as never)

    assert.deepEqual(resolved.metadataExtractors, [])
  })

  test('requires a metadata persister for deferred extraction outside Lucid', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }

    await assert.rejects(
      () =>
        defineConfig({
          defaultDisk: 'public',
          storage,
          media: {
            metadata: [],
            metadataPolicy: { mode: 'deferred' },
          },
        }).resolver({} as never),
      'Deferred metadata extraction requires media.metadataPersister or integrations.lucid'
    )
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

  test('applies shared binary config to autodetected converters and lets local options override it', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() { return new Uint8Array() },
      async remove() {},
    }
    const sharedRunner = new FakePdfRunner()
    const localRunner = new FakePdfRunner()
    const resolved = await defineConfig({
      storage,
      media: {
        binaries: { pdftoppm: { command: '/opt/media/pdftoppm', timeout: 5_000 } },
      },
      converters: {
        shared: { runner: sharedRunner },
        local: { runner: localRunner, pdftoppmCommand: '/workspace/pdftoppm', timeout: 1_000 },
      },
    }).resolver({} as never)

    await (await resolved.converters?.get('shared'))?.convert({ attachment: pdf, body: new Uint8Array([1]) })
    await (await resolved.converters?.get('local'))?.convert({ attachment: pdf, body: new Uint8Array([1]) })

    assert.equal(sharedRunner.executions[0]?.command, '/opt/media/pdftoppm')
    assert.equal(sharedRunner.executions[0]?.timeout, 5_000)
    assert.deepEqual(sharedRunner.executions[0]?.args.slice(0, 4), ['-f', '1', '-singlefile', '-png'])
    assert.equal(localRunner.executions[0]?.command, '/workspace/pdftoppm')
    assert.equal(localRunner.executions[0]?.timeout, 1_000)
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
    assert.instanceOf(resolved.repository, LucidAttachmentRepository)
  })

  test('uses Lucid defaults when its container binding is available', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const app = {
      container: {
        hasBinding(binding: string) {
          return binding === 'lucid.db'
        },
      },
    }

    const resolved = await defineConfig({ storage }).resolver(app as never)

    assert.instanceOf(resolved.repository, LucidAttachmentRepository)
    assert.deepEqual(resolved.integrations?.lucid, {
      tableName: 'attachments',
      linksTableName: 'attachment_links',
    })
  })

  test('uses Lucid as the deferred metadata persister when it is detected', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const app = {
      container: {
        hasBinding(binding: string) {
          return binding === 'lucid.db'
        },
      },
    }

    const resolved = await defineConfig({
      storage,
      media: { metadataPolicy: { mode: 'deferred' } },
    }).resolver(app as never)

    assert.instanceOf(resolved.metadataPersister, LucidAttachmentMetadataPersister)
  })

  test('allows automatic Lucid integration to be disabled', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const app = {
      container: {
        hasBinding() {
          return true
        },
      },
    }

    const resolved = await defineConfig({
      storage,
      integrations: { lucid: false },
    }).resolver(app as never)

    assert.isUndefined(resolved.repository)
    assert.isUndefined(resolved.integrations)
  })

  test('prefers an explicit repository over the detected Lucid repository', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const repository = { async findById() { return null } }
    const app = {
      container: {
        hasBinding() {
          return true
        },
      },
    }

    const resolved = await defineConfig({ storage, repository }).resolver(app as never)

    assert.equal(resolved.repository, repository)
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
    const config = defineConfig({
      defaultDisk: 'public',
      storage,
      processor,
      queue: { driver: 'memory', concurrency: 1 },
    })
    const resolved = await config.resolver({
      container: {
        hasBinding(binding: string) {
          return binding === 'lucid.db'
        },
      },
    } as never)

    await resolved.queue.enqueue({ type: 'generate-variants', attachmentId: 'attachment-id' })
    await (resolved.queue as MemoryAttachmentQueue).drain()

    assert.deepEqual(processed, [{ type: 'generate-variants', attachmentId: 'attachment-id' }])
  })

  test('gives jobHandler precedence over the default Lucid processor', async ({ assert }) => {
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const processed: AttachmentJob[] = []
    const resolved = await defineConfig({
      storage,
      jobHandler: () => async (job: AttachmentJob) => {
        processed.push(job)
      },
    }).resolver({
      container: {
        hasBinding(binding: string) {
          return binding === 'lucid.db'
        },
      },
    } as never)

    await resolved.queue.enqueue({
      type: 'generate-variants',
      attachmentId: pdf.id,
    })
    await (resolved.queue as MemoryAttachmentQueue).drain()

    assert.deepEqual(processed, [{ type: 'generate-variants', attachmentId: pdf.id }])
  })
})
