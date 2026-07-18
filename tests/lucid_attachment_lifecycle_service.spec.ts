import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import { AttachmentModel } from '../src/integrations/lucid/attachment_model.js'
import { LucidAttachmentLifecycleService } from '../src/integrations/lucid/lucid_attachment_lifecycle_service.js'

const attachment: Attachment = {
  id: 'attachment-id',
  disk: 'public',
  path: 'users/42/avatar.jpg',
  name: 'avatar.jpg',
  originalName: 'profile.jpg',
  mimeType: 'image/jpeg',
  extname: 'jpg',
  size: 42,
}

test.group('LucidAttachmentLifecycleService', () => {
  test('persists the file before creating its polymorphic row', async ({ assert }) => {
    const events: string[] = []
    const service = new LucidAttachmentLifecycleService(
      {
        async create() {
          events.push('write')
          return attachment
        },
        async remove() {},
      },
      {
        async createOriginal() {
          events.push('persist')
          return {} as AttachmentModel
        },
        async findOriginal() {
          return null
        },
        async listVariants() {
          return []
        },
        async remove() {},
      }
    )

    await service.attach({ type: 'users', id: '42', field: 'avatar' }, {
      body: new Uint8Array(),
      originalName: 'profile.jpg',
    })

    assert.deepEqual(events, ['write', 'persist'])
  })

  test('removes a new file when database persistence fails', async ({ assert }) => {
    const removed: Attachment[] = []
    const service = new LucidAttachmentLifecycleService(
      {
        async create() {
          return attachment
        },
        async remove(value) {
          removed.push(value)
        },
      },
      {
        async createOriginal() {
          throw new Error('database unavailable')
        },
        async findOriginal() {
          return null
        },
        async listVariants() {
          return []
        },
        async remove() {},
      }
    )

    await assert.rejects(
      () =>
        service.attach({ type: 'users', id: '42', field: 'avatar' }, {
          body: new Uint8Array(),
          originalName: 'profile.jpg',
        }),
      'database unavailable'
    )

    assert.deepEqual(removed, [attachment])
  })
})
