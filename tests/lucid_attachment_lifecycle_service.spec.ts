/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import { AttachmentService } from '../src/core/attachment_service.js'
import { AttachmentLinkModel } from '../src/integrations/lucid/models/attachment_link_model.js'
import { AttachmentModel } from '../src/integrations/lucid/models/attachment_model.js'
import { LucidAttachmentLifecycleService } from '../src/integrations/lucid/persistence/lucid_attachment_lifecycle_service.js'

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

function makeBlob(value: Attachment): AttachmentModel {
  return {
    id: value.id,
    toAttachment() {
      return value
    },
  } as AttachmentModel
}

function makeLink(value: Attachment, id = `link-${value.id}`): AttachmentLinkModel {
  const blob = makeBlob(value)

  return {
    id,
    attachmentId: value.id,
    attachment: blob,
    toAttachment() {
      return value
    },
  } as AttachmentLinkModel
}

function makeStore(overrides: Partial<Record<string, unknown>> = {}) {
  const link = makeLink(attachment)

  return {
    async createOriginal() {
      return link
    },
    async findOriginal() {
      return null
    },
    async listVariants() {
      return [] as AttachmentModel[]
    },
    async releaseOwner() {},
    async restoreOwner() {},
    async remove() {
      return [] as AttachmentModel[]
    },
    async createCollectionItem() {
      return link
    },
    async findCollectionItem() {
      return null
    },
    async listCollection() {
      return [] as AttachmentLinkModel[]
    },
    async moveCollectionItem() {
      return [] as AttachmentLinkModel[]
    },
    async removeCollectionItem() {
      return [] as AttachmentModel[]
    },
    ...overrides,
  } as never
}

test.group('LucidAttachmentLifecycleService', () => {
  test('persists a manager draft before creating its polymorphic link', async ({ assert }) => {
    const events: string[] = []
    const attachments = new AttachmentService({
      defaultDisk: 'fs',
      createId: () => attachment.id,
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
    const draft = attachments.createDraft({ body: new Uint8Array([1]), originalName: 'profile.jpg' })
    const service = new LucidAttachmentLifecycleService(
      attachments,
      makeStore({
        async createOriginal() {
          events.push('link')
          return makeLink(attachment)
        },
      })
    )

    await service.attach({ type: 'users', id: '42', field: 'avatar' }, draft)

    assert.isTrue(draft.isPersisted)
    assert.deepEqual(events, ['write', 'link'])
  })

  test('schedules deferred metadata after the attachment blob exists', async ({ assert }) => {
    const jobs: string[] = []
    const attachments = new AttachmentService({
      defaultDisk: 'fs',
      createId: () => attachment.id,
      queue: {
        async enqueue(job) {
          jobs.push(`${job.type}:${job.attachmentId}`)
        },
      },
      storage: {
        async write() {},
        async read() { return new Uint8Array() },
        async remove() {},
      },
      metadataMode: 'deferred',
      metadataExtractors: [{ async extract() { return {} } }],
      metadataPersister: { async persistMetadata() {} },
    })
    const draft = attachments.createDraft({ body: new Uint8Array([1]), originalName: 'profile.jpg' })
    const service = new LucidAttachmentLifecycleService(attachments, makeStore())

    await service.attach({ type: 'users', id: '42', field: 'avatar' }, draft, { meta: true })

    assert.deepEqual(jobs, ['extract-metadata:attachment-id'])
  })

  test('removes a new file when blob or link persistence fails', async ({ assert }) => {
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
      makeStore({
        async createOriginal() {
          throw new Error('database unavailable')
        },
      })
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

  test('replaces a link before purging its unreferenced blob', async ({ assert }) => {
    const events: string[] = []
    const previousAttachment = { ...attachment, id: 'previous-id', path: 'users/42/previous.jpg' }
    const currentAttachment = { ...attachment, id: 'current-id', path: 'users/42/current.jpg' }
    const previous = makeLink(previousAttachment)
    const current = makeLink(currentAttachment)
    const service = new LucidAttachmentLifecycleService(
      {
        async create() {
          events.push('write')
          return currentAttachment
        },
        async remove(value) {
          events.push(`remove-file:${value.id}`)
        },
      },
      makeStore({
        async createOriginal() {
          events.push('create-link')
          return current
        },
        async findOriginal() {
          return previous
        },
        async releaseOwner() {
          events.push('release-link')
        },
        async remove() {
          events.push('remove-link')
          return [makeBlob(previousAttachment)]
        },
      })
    )

    await service.replace({ type: 'users', id: '42', field: 'avatar' }, {
      body: new Uint8Array(),
      originalName: 'profile.jpg',
    })

    assert.deepEqual(events, [
      'write',
      'release-link',
      'create-link',
      'remove-link',
      'remove-file:previous-id',
    ])
  })

  test('only removes files for blobs that became unreferenced', async ({ assert }) => {
    const removed: string[] = []
    const service = new LucidAttachmentLifecycleService(
      {
        async create() {
          return attachment
        },
        async remove(value) {
          removed.push(value.id)
        },
      },
      makeStore({
        async findOriginal() {
          return makeLink(attachment)
        },
        async remove() {
          return []
        },
      })
    )

    await service.detach({ type: 'users', id: '42', field: 'avatar' })

    assert.deepEqual(removed, [])
  })

  test('adds and removes ordered collection links', async ({ assert }) => {
    const item = makeLink(attachment)
    const removed: string[] = []
    const service = new LucidAttachmentLifecycleService(
      {
        async create() {
          return attachment
        },
        async remove(value) {
          removed.push(value.id)
        },
      },
      makeStore({
        async createCollectionItem() {
          return item
        },
        async findCollectionItem() {
          return item
        },
        async removeCollectionItem() {
          return [makeBlob(attachment)]
        },
      })
    )

    const added = await service.add(
      { type: 'users', id: '42', field: 'gallery' },
      { body: new Uint8Array(), originalName: 'profile.jpg' }
    )
    const didRemove = await service.removeCollectionItem(
      { type: 'users', id: '42', field: 'gallery' },
      added.id
    )

    assert.equal(added.id, item.id)
    assert.isTrue(didRemove)
    assert.deepEqual(removed, [attachment.id])
  })
})
