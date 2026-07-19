/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { defineConfig, type AttachmentRepository, type AttachmentStorage } from '../index.js'
import AttachmentProvider from '../providers/attachment_provider.js'

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

test.group('AttachmentProvider', () => {
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

    assert.deepEqual(routes, ['/media/:id'])
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
})
