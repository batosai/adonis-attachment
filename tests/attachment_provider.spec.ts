/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { defineConfig, type AttachmentRepository, type AttachmentStorage } from '../index.js'
import AttachmentProvider from '../providers/attachment_provider.js'
import { AttachmentLinkModel } from '../src/integrations/lucid/models/attachment_link_model.js'
import { AttachmentModel } from '../src/integrations/lucid/models/attachment_model.js'
import { configureLucidAttachmentTables } from '../src/integrations/lucid/schema/configure_lucid_attachment_tables.js'
import { LucidJsonAttachmentRegistry } from '../src/integrations/lucid/json/lucid_json_attachment_registry.js'

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

  test('registers the configured read route when persistence is available', async ({ assert }) => {
    const routes: string[] = []
    const provider = new AttachmentProvider({
      config: {
        get() {
          return defineConfig({
            defaultDisk: 'public',
            storage,
            repository,
            route: { prefix: '/media' },
          })
        },
      },
      container: {
        async make(binding: string) {
          assert.equal(binding, 'router')
          return {
            get(path: string) {
              routes.push(path)
            },
          }
        },
      },
    } as never)

    await provider.boot()

    assert.deepEqual(routes, ['/media/:id/:name?'])
  })

  test('does not register a route when it is disabled or has no repository', async ({ assert }) => {
    for (const config of [
      defineConfig({ defaultDisk: 'public', storage, repository, route: false }),
      defineConfig({ defaultDisk: 'public', storage }),
    ]) {
      const provider = new AttachmentProvider({
        config: {
          get() {
            return config
          },
        },
        container: {
          async make() {
            assert.fail('The router must not be resolved')
          },
        },
      } as never)

      await provider.boot()
    }
  })

  test('registers the default route when Lucid is available', async ({ assert }) => {
    const routes: string[] = []
    const provider = new AttachmentProvider({
      config: {
        get() {
          return defineConfig({ storage })
        },
      },
      container: {
        hasBinding(binding: string) {
          return binding === 'lucid.db'
        },
        async make(binding: string) {
          assert.equal(binding, 'router')
          return {
            get(path: string) {
              routes.push(path)
            },
          }
        },
      },
    } as never)

    await provider.boot()

    assert.deepEqual(routes, ['/attachments/:id/:name?'])
  })

  test('applies configured Lucid table names during application boot', async ({ assert }) => {
    const routes: string[] = []
    const provider = new AttachmentProvider({
      config: {
        get() {
          return defineConfig({
            defaultDisk: 'public',
            storage,
            integrations: {
              lucid: { tableName: 'media_attachments' },
            },
          })
        },
      },
      container: {
        async make(binding: string) {
          assert.equal(binding, 'router')
          return {
            get(path: string) {
              routes.push(path)
            },
          }
        },
      },
    } as never)

    await provider.boot()

    assert.equal(AttachmentModel.table, 'media_attachments')
    assert.equal(AttachmentLinkModel.table, 'media_attachment_links')
    assert.deepEqual(routes, ['/attachments/:id/:name?'])
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
      const config = defineConfig({ storage, route: false, integrations: { lucid: enabled ? {
        jsonModels: { users: async () => { imports++; return { default: AttachmentModel } } },
      } : false } })
      const provider = new AttachmentProvider({
        config: { get: () => config },
        container: { singleton(name: string, factory: () => Promise<unknown>) { bindings.set(name, factory) } },
      } as never)
      provider.register()
      const factory = bindings.get('jrmc.attachment.json')!
      if (enabled) assert.instanceOf(await factory(), LucidJsonAttachmentRegistry)
      else await assert.rejects(factory, /require integrations.lucid.jsonModels/)
      assert.equal(imports, 0)
    }
  })
})
