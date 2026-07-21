/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import { MediaMetadataService } from '../index.js'

const attachment: Attachment = {
  id: 'attachment-id',
  disk: 'fs',
  path: 'uploads/avatar.png',
  name: 'avatar.png',
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extname: 'png',
  size: 3,
}

test.group('MediaMetadataService', () => {
  test('runs matching extractors in declaration order', async ({ assert }) => {
    const calls: string[] = []
    const service = new MediaMetadataService([
      {
        supports({ attachment: current }) {
          return current.mimeType.startsWith('image/')
        },
        async extract(input) {
          calls.push(input.attachment.id)
          return { width: 800, format: 'png' }
        },
      },
      {
        supports() {
          return false
        },
        async extract() {
          throw new Error('Unsupported extractors must not run')
        },
      },
      {
        async extract() {
          return { width: 400, height: 300 }
        },
      },
    ])

    const metadata = await service.extract({ attachment, body: new Uint8Array([1, 2, 3]) })

    assert.deepEqual(calls, ['attachment-id'])
    assert.deepEqual(metadata, { width: 400, format: 'png', height: 300 })
  })
})
