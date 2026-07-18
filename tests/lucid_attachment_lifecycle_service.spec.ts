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

function makeRow(value: Attachment, id = value.id): AttachmentModel {
  return {
    id,
    toAttachment() {
      return value
    },
  } as AttachmentModel
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

  test('replaces the persisted row before removing the previous file', async ({ assert }) => {
    const events: string[] = []
    const previousAttachment = { ...attachment, id: 'previous-id', path: 'users/42/previous.jpg' }
    const currentAttachment = { ...attachment, id: 'current-id', path: 'users/42/current.jpg' }
    const previous = makeRow(previousAttachment)
    const current = makeRow(currentAttachment)
    const service = new LucidAttachmentLifecycleService(
      {
        async create() {
          events.push('write-current')
          return currentAttachment
        },
        async remove(value) {
          events.push(`remove-file:${value.id}`)
        },
      },
      {
        async createOriginal() {
          events.push('persist-current')
          return current
        },
        async findOriginal() {
          return previous
        },
        async listVariants() {
          return []
        },
        async remove(row) {
          events.push(`remove-row:${row.id}`)
        },
      }
    )

    const row = await service.replace({ type: 'users', id: '42', field: 'avatar' }, {
      body: new Uint8Array(),
      originalName: 'profile.jpg',
    })

    assert.equal(row, current)
    assert.deepEqual(events, [
      'write-current',
      'persist-current',
      'remove-row:previous-id',
      'remove-file:previous-id',
    ])
  })

  test('detaches the original and every persisted variant', async ({ assert }) => {
    const removedRows: string[] = []
    const removedFiles: string[] = []
    const original = makeRow(attachment)
    const variant = makeRow({ ...attachment, id: 'variant-id', path: 'users/42/thumbnail.webp' })
    const service = new LucidAttachmentLifecycleService(
      {
        async create() {
          return attachment
        },
        async remove(value) {
          removedFiles.push(value.id)
        },
      },
      {
        async createOriginal() {
          return original
        },
        async findOriginal() {
          return original
        },
        async listVariants() {
          return [variant]
        },
        async remove(row) {
          removedRows.push(row.id)
        },
      }
    )

    await service.detach({ type: 'users', id: '42', field: 'avatar' })

    assert.deepEqual(removedRows, ['attachment-id'])
    assert.sameDeepMembers(removedFiles, ['attachment-id', 'variant-id'])
  })
})
