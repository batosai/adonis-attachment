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
          async delete(path) {
            calls.push({ disk, path })
          },
        }
      },
    })

    await storage.remove({ disk: 'public', path: 'users/42/avatar.jpg' })

    assert.deepEqual(calls, [{ disk: 'public', path: 'users/42/avatar.jpg' }])
  })
})
