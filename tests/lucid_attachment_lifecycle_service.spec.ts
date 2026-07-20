/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import { AttachmentService } from '../src/core/attachment_service.js'
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
  test('persists a manager draft before inserting its polymorphic row', async ({ assert }) => {
    const events: string[] = []
    const attachments = new AttachmentService({
      defaultDisk: 'fs',
      createId: () => 'attachment-id',
      queue: { async enqueue() {} },
      storage: {
        async write() {
          events.push('write')
        },
        async read() {
          return new Uint8Array()
        },
        async remove() {},
      },
    })
    const draft = attachments.createDraft({
      body: new Uint8Array([1]),
      originalName: 'profile.jpg',
    })
    const service = new LucidAttachmentLifecycleService(
      attachments,
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
        async releaseOwner() {},
        async restoreOwner() {},
        async remove() {},
      }
    )

    assert.isFalse(draft.isPersisted)
    await service.attach({ type: 'users', id: '42', field: 'avatar' }, draft)

    assert.isTrue(draft.isPersisted)
    assert.deepEqual(events, ['write', 'persist'])
  })

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
        async releaseOwner() {},
        async restoreOwner() {},
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
        async releaseOwner() {},
        async restoreOwner() {},
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
        async releaseOwner() {
          events.push('release-previous')
        },
        async restoreOwner() {},
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
      'release-previous',
      'persist-current',
      'remove-row:previous-id',
      'remove-file:previous-id',
    ])
  })

  test('restores the previous owner when replacement persistence fails', async ({ assert }) => {
    const events: string[] = []
    const previous = makeRow(attachment, 'previous-id')
    const currentAttachment = { ...attachment, id: 'current-id', path: 'users/42/current.jpg' }
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
          throw new Error('database unavailable')
        },
        async findOriginal() {
          return previous
        },
        async listVariants() {
          return []
        },
        async releaseOwner() {
          events.push('release-previous')
        },
        async restoreOwner() {
          events.push('restore-previous')
        },
        async remove() {},
      }
    )

    await assert.rejects(
      () =>
        service.replace({ type: 'users', id: '42', field: 'avatar' }, {
          body: new Uint8Array(),
          originalName: 'profile.jpg',
        }),
      'database unavailable'
    )

    assert.deepEqual(events, [
      'write-current',
      'release-previous',
      'restore-previous',
      'remove-file:current-id',
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
        async releaseOwner() {},
        async restoreOwner() {},
        async remove(row) {
          removedRows.push(row.id)
        },
      }
    )

    await service.detach({ type: 'users', id: '42', field: 'avatar' })

    assert.deepEqual(removedRows, ['attachment-id'])
    assert.sameDeepMembers(removedFiles, ['attachment-id', 'variant-id'])
  })

  test('persists a collection item before inserting its polymorphic row', async ({ assert }) => {
    const events: string[] = []
    const item = makeRow(attachment)
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
          return item
        },
        async findOriginal() {
          return null
        },
        async listVariants() {
          return []
        },
        async releaseOwner() {},
        async restoreOwner() {},
        async remove() {},
        async createCollectionItem() {
          events.push('persist')
          return item
        },
        async findCollectionItem() {
          return null
        },
        async listCollection() {
          return []
        },
        async moveCollectionItem() {
          return []
        },
        async removeCollectionItem() {},
      }
    )

    await service.add({ type: 'users', id: '42', field: 'avatars' }, {
      body: new Uint8Array(),
      originalName: 'profile.jpg',
    })

    assert.deepEqual(events, ['write', 'persist'])
  })

  test('removes a collection file when its database insertion fails', async ({ assert }) => {
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
          return makeRow(attachment)
        },
        async findOriginal() {
          return null
        },
        async listVariants() {
          return []
        },
        async releaseOwner() {},
        async restoreOwner() {},
        async remove() {},
        async createCollectionItem() {
          throw new Error('database unavailable')
        },
        async findCollectionItem() {
          return null
        },
        async listCollection() {
          return []
        },
        async moveCollectionItem() {
          return []
        },
        async removeCollectionItem() {},
      }
    )

    await assert.rejects(
      () =>
        service.add({ type: 'users', id: '42', field: 'avatars' }, {
          body: new Uint8Array(),
          originalName: 'profile.jpg',
        }),
      'database unavailable'
    )

    assert.deepEqual(removed, [attachment])
  })

  test('removes a collection item and its persisted variants', async ({ assert }) => {
    const removedRows: string[] = []
    const removedFiles: string[] = []
    const item = makeRow(attachment)
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
          return item
        },
        async findOriginal() {
          return null
        },
        async listVariants() {
          return [variant]
        },
        async releaseOwner() {},
        async restoreOwner() {},
        async remove() {},
        async createCollectionItem() {
          return item
        },
        async findCollectionItem() {
          return item
        },
        async listCollection() {
          return [item]
        },
        async moveCollectionItem() {
          return [item]
        },
        async removeCollectionItem(_owner, row) {
          removedRows.push(row.id)
        },
      }
    )

    const removed = await service.removeCollectionItem(
      { type: 'users', id: '42', field: 'avatars' },
      attachment.id
    )

    assert.isTrue(removed)
    assert.deepEqual(removedRows, ['attachment-id'])
    assert.sameDeepMembers(removedFiles, ['attachment-id', 'variant-id'])
  })
})
