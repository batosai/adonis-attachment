import { RouterFactory } from '@adonisjs/core/factories/http'
import { LucidAttachmentStore } from '../src/stores/lucid/persistence/lucid_attachment_store.js'
/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { defineConfig, type AttachmentRepository, type AttachmentStorage } from '../index.js'
import AttachmentProvider from '../providers/attachment_provider.js'
import { AttachmentLinkModel } from '../src/stores/lucid/models/attachment_link_model.js'
import { AttachmentModel } from '../src/stores/lucid/models/attachment_model.js'
import { configureLucidAttachmentTables } from '../src/stores/lucid/schema/configure_lucid_attachment_tables.js'
import { LucidJsonAttachmentRegistry } from '../src/stores/lucid/legacy/json/lucid_json_attachment_registry.js'

const storage: AttachmentStorage = {
  async write() {},
  async read() {
    return new Uint8Array()
  },
  async remove() {},
}

const repository: AttachmentRepository = {
  async findById() {
    return null
  },
}

test.group('AttachmentProvider', (group) => {
  group.each.teardown(() => {
    configureLucidAttachmentTables()
  })

  async function boot(config = defineConfig({ defaultDisk: 'public', storage, store: { repository } })) {
    const provider = new AttachmentProvider({
      config: { get: () => config },
      container: { async make() { throw new Error('No service should be resolved before a request') } },
    } as never)
    await provider.boot()
    return new RouterFactory().create()
  }

  test('exposes no route until explicitly registered and supports native route configuration', async ({ assert }) => {
    const router = await boot()
    assert.deepEqual(router.toJSON(), {})
    const guard = async (_ctx: unknown, next: () => Promise<unknown>) => next()
    router.group(() => {
      router.attachments('/media/:id/:name?').use(guard).as('files.show')
    }).prefix('/api').as('api')
    router.commit()
    const route = router.find('api.files.show')!
    assert.equal(route.pattern, '/api/media/:id/:name?')
    assert.include(route.middleware.all(), guard)
    assert.isNotNull(router.match('/api/media/abc/photo.jpg', 'GET', true))
    assert.isNotNull(router.match('/api/media/abc', 'GET', true))
  })

  test('supports the default pattern, separate routes and rejects empty disk selections', async ({ assert }) => {
    const router = await boot()
    assert.equal(router.attachments().getPattern(), '/attachments/:id/:name?')
    router.attachments('/documents/:id/:name?', { disks: ['private'] }).as('documents.show')
    for (const disks of [[], [''], ['   ']]) {
      assert.throws(() => router.attachments(undefined, { disks }), 'Attachment route disks must be a non-empty array of disk names')
    }
    router.commit()
    assert.isNotNull(router.find('documents.show'))
  })

  test('requires a repository only when declaring an attachment route', async ({ assert }) => {
    const router = await boot(defineConfig({ storage }))
    assert.throws(() => router.attachments(), 'router.attachments() requires store.repository in config/attachment.ts')
  })

  test('still resolves configured Lucid table names without exposing routes', async ({ assert }) => {
    const router = await boot(defineConfig({ storage, store: LucidAttachmentStore.configure({ tableName: 'media_attachments' }) }))
    assert.equal(AttachmentModel.table, 'media_attachments')
    assert.equal(AttachmentLinkModel.table, 'media_attachment_links')
    assert.deepEqual(router.toJSON(), {})
  })

  test('uses defaultDisk and isolates public and private files with the same repository', async ({ assert }) => {
    let reads = 0
    const provider = new AttachmentProvider({
      config: { get: () => defineConfig({ defaultDisk: 'public', storage, store: { repository } }) },
      container: { async make(binding: string) {
        if (binding === 'jrmc.attachment') return { async read() { reads++; return new Uint8Array([1]) } }
        return { async findById(id: string) {
          if (id === 'missing') return null
          return { id, disk: id, path: 'file', mimeType: 'image/jpeg' }
        } }
      } },
    } as never)
    await provider.boot()
    const router = new RouterFactory().create()
    const publicHandler = router.attachments().getHandler()
    const combinedHandler = router.attachments('/all/:id', { disks: ['public', 'private'] }).getHandler()
    const disks = ['private']
    const privateHandler = router.attachments('/private/:id', { disks }).getHandler()
    disks.push('public') // Declared access cannot be changed by mutating the options later.
    assert.isFunction(publicHandler)
    assert.isFunction(privateHandler)
    for (const [handler, id, expected] of [
      [publicHandler, 'public', 200], [publicHandler, 'private', 404],
      [privateHandler, 'private', 200], [privateHandler, 'public', 404],
      [publicHandler, 'missing', 404],
      [combinedHandler, 'public', 200], [combinedHandler, 'private', 200],
    ] as const) {
      let status = 200
      const context = { request: { param: () => id }, response: {
        header() {}, send() {}, notFound() { status = 404 },
      } }
      if (typeof handler === 'function') await handler(context as never)
      assert.equal(status, expected)
    }
    assert.equal(reads, 4)
  })

  test('inherits the storage default disk and falls back to fs', async ({ assert }) => {
    for (const defaultDisk of ['storage-default', undefined]) {
      let reads = 0
      const provider = new AttachmentProvider({
        config: { get: () => defineConfig({
          storage: { ...storage, ...(defaultDisk ? { defaultDisk } : {}) },
          store: { repository },
        }) },
        container: { async make(binding: string) {
          if (binding === 'jrmc.attachment') return { async read() { reads++; return new Uint8Array() } }
          return { async findById(id: string) { return { id, disk: id, mimeType: 'image/jpeg' } } }
        } },
      } as never)
      await provider.boot()
      const router = new RouterFactory().create()
      const handler = router.attachments().getHandler()
      assert.isFunction(handler)
      for (const id of [defaultDisk ?? 'fs', 'other-disk']) {
        let status = 200
        if (typeof handler === 'function') await handler({
          request: { param: () => id },
          response: { header() {}, send() {}, notFound() { status = 404 } },
        } as never)
        assert.equal(status, id === 'other-disk' ? 404 : 200)
      }
      assert.equal(reads, 1)
    }
  })

  test('registers the configured converter registry', async ({ assert }) => {
    const bindings = new Map<string, () => Promise<unknown>>()
    let imports = 0
    const config = defineConfig({
      defaultDisk: 'public',
      storage,
      converters: {
        thumbnail: {
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
    })
    const app = {
      config: { get: () => config },
      container: {
        singleton(binding: string, factory: () => Promise<unknown>) {
          bindings.set(binding, factory)
        },
      },
    }
    const provider = new AttachmentProvider(app as never)

    provider.register()
    const factory = bindings.get('jrmc.attachment.converters')
    const registry = await factory?.() as { keys(): Promise<readonly string[]>; get(key: string): Promise<unknown> }

    assert.deepEqual(await registry.keys(), ['thumbnail'])
    assert.equal(imports, 0)
    assert.isDefined(await registry.get('thumbnail'))
    assert.equal(imports, 1)
  })

  test('registers a configured attachment event emitter', async ({ assert }) => {
    const bindings = new Map<string, () => Promise<unknown>>()
    const events = { emit() {} }
    const config = defineConfig({ defaultDisk: 'public', storage, events })
    const provider = new AttachmentProvider({
      config: { get: () => config },
      container: {
        singleton(binding: string, factory: () => Promise<unknown>) {
          bindings.set(binding, factory)
        },
      },
    } as never)

    provider.register()

    assert.equal(await bindings.get('jrmc.attachment.events')?.(), events)
  })

  test('exposes the configured lazy JSON model registry to external workers', async ({ assert }) => {
    for (const enabled of [true, false]) {
      const bindings = new Map<string, () => Promise<unknown>>()
      let imports = 0
      const config = defineConfig({ storage, store: enabled ? LucidAttachmentStore.configure({ legacy: {
        models: { users: async () => { imports++; return { default: AttachmentModel } } },
      } }) : false })
      const provider = new AttachmentProvider({
        config: { get: () => config },
        container: { singleton(name: string, factory: () => Promise<unknown>) { bindings.set(name, factory) } },
      } as never)
      provider.register()
      const factory = bindings.get('jrmc.attachment.processingAdapters')!
      if (enabled) assert.instanceOf(((await factory()) as { json: { repository: unknown } }).json.repository, LucidJsonAttachmentRegistry)
      else assert.deepEqual(await factory(), {})
      assert.equal(imports, 0)
    }
  })
})
