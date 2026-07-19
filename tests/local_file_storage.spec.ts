import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test } from '@japa/runner'

import { LocalFileStorage } from '../index.js'

test.group('LocalFileStorage', () => {
  test('writes, reads, and removes attachments below its root directory', async ({ assert }) => {
    const location = await mkdtemp(join(tmpdir(), 'adonis-attachment-'))
    const storage = new LocalFileStorage({ location })

    try {
      await storage.write({
        disk: 'fs',
        path: 'users/42/avatar.png',
        body: new Uint8Array([1, 2, 3]),
        mimeType: 'image/png',
      })

      assert.deepEqual(await storage.read({ disk: 'fs', path: 'users/42/avatar.png' }), new Uint8Array([1, 2, 3]))
      assert.deepEqual(await readFile(join(location, 'users/42/avatar.png')), Buffer.from([1, 2, 3]))

      await storage.remove({ disk: 'fs', path: 'users/42/avatar.png' })
      await assert.rejects(() => access(join(location, 'users/42/avatar.png')))
    } finally {
      await rm(location, { recursive: true, force: true })
    }
  })

  test('rejects paths outside its root and unsupported disks', async ({ assert }) => {
    const location = await mkdtemp(join(tmpdir(), 'adonis-attachment-'))
    const storage = new LocalFileStorage({ location })

    try {
      await assert.rejects(
        () => storage.write({ disk: 'fs', path: '../outside.txt', body: new Uint8Array(), mimeType: 'text/plain' }),
        'Attachment paths must stay inside the local storage directory'
      )
      await assert.rejects(
        () => storage.write({ disk: 's3', path: 'avatar.txt', body: new Uint8Array(), mimeType: 'text/plain' }),
        'LocalFileStorage cannot access the "s3" disk'
      )
    } finally {
      await rm(location, { recursive: true, force: true })
    }
  })
})
