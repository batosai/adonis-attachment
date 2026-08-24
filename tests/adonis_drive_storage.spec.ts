/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { AdonisDriveStorage } from '../index.js'

test.group('AdonisDriveStorage', () => {
  test('writes an attachment through the selected Drive disk', async ({ assert }) => {
    const calls: Array<{ disk: string | undefined; path: string; contents: Uint8Array }> = []
    const storage = new AdonisDriveStorage({
      use(disk) {
        return {
          async put(path, contents) {
            calls.push({ disk, path, contents })
          },
          async getBytes() {
            return new Uint8Array()
          },
          async delete() {},
        }
      },
    })

    await storage.write({
      disk: 's3',
      path: 'users/42/avatar.jpg',
      body: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
    })

    assert.deepEqual(calls, [
      { disk: 's3', path: 'users/42/avatar.jpg', contents: new Uint8Array([1, 2, 3]) },
    ])
  })

  test('deletes an attachment through the selected Drive disk', async ({ assert }) => {
    const calls: Array<{ disk: string | undefined; path: string }> = []
    const storage = new AdonisDriveStorage({
      use(disk) {
        return {
          async put() {},
          async getBytes() {
            return new Uint8Array()
          },
          async delete(path) {
            calls.push({ disk, path })
          },
        }
      },
    })

    await storage.remove({ disk: 'public', path: 'users/42/avatar.jpg' })

    assert.deepEqual(calls, [{ disk: 'public', path: 'users/42/avatar.jpg' }])
  })

  test('reads an attachment through the selected Drive disk', async ({ assert }) => {
    const storage = new AdonisDriveStorage({
      use() {
        return {
          async put() {},
          async getBytes(path) {
            assert.equal(path, 'users/42/avatar.jpg')
            return new Uint8Array([1, 2, 3])
          },
          async delete() {},
        }
      },
    })

    assert.deepEqual(
      await storage.read({ disk: 'public', path: 'users/42/avatar.jpg' }),
      new Uint8Array([1, 2, 3])
    )
  })

  test('resolves public and signed URLs when the selected disk supports them', async ({ assert }) => {
    const calls: Array<{ type: string; path: string; options?: Record<string, unknown> }> = []
    const storage = new AdonisDriveStorage({
      use() {
        return {
          async put() {},
          async getBytes() { return new Uint8Array() },
          async delete() {},
          async getUrl(path) {
            calls.push({ type: 'public', path })
            return `https://cdn.example.test/${path}`
          },
          async getSignedUrl(path, options) {
            calls.push({ type: 'signed', path, ...(options ? { options } : {}) })
            return `https://cdn.example.test/${path}?signature=value`
          },
        }
      },
    })

    assert.equal(await storage.getUrl({ disk: 's3', path: 'users/42/avatar.jpg' }), 'https://cdn.example.test/users/42/avatar.jpg')
    assert.equal(
      await storage.getSignedUrl({ disk: 's3', path: 'users/42/avatar.jpg' }, { expiresIn: '15m' }),
      'https://cdn.example.test/users/42/avatar.jpg?signature=value'
    )
    assert.deepEqual(calls, [
      { type: 'public', path: 'users/42/avatar.jpg' },
      { type: 'signed', path: 'users/42/avatar.jpg', options: { expiresIn: '15m' } },
    ])
  })
})
