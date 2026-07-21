/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import {
  AttachmentService,
  type AttachmentJob,
  type AttachmentStorage,
  type StorageLocation,
  type WriteAttachmentInput,
} from '../index.js'

class FakeStorage implements AttachmentStorage {
  writes: WriteAttachmentInput[] = []
  removals: StorageLocation[] = []
  reads: StorageLocation[] = []

  async write(input: WriteAttachmentInput): Promise<void> {
    this.writes.push(input)
  }

  async read(location: StorageLocation): Promise<Uint8Array> {
    this.reads.push(location)
    return new Uint8Array([1, 2, 3])
  }

  async remove(location: StorageLocation): Promise<void> {
    this.removals.push(location)
  }
}

class FakeQueue {
  jobs: AttachmentJob[] = []

  async enqueue(job: AttachmentJob): Promise<void> {
    this.jobs.push(job)
  }
}

test('creates a standalone attachment and delegates its content to storage', async ({ assert }) => {
  const storage = new FakeStorage()
  const queue = new FakeQueue()
  const service = new AttachmentService({
    storage,
    queue,
    defaultDisk: 'public',
    createId: () => 'attachment-id',
  })

  const attachment = await service.create({
    body: new Uint8Array([1, 2, 3]),
    originalName: 'avatar.JPG',
    mimeType: 'image/jpeg',
    folder: 'users/42',
  })

  assert.deepEqual(attachment, {
    id: 'attachment-id',
    disk: 'public',
    name: 'attachment-id.jpg',
    originalName: 'avatar.JPG',
    path: 'users/42/attachment-id.jpg',
    size: 3,
    extname: 'jpg',
    mimeType: 'image/jpeg',
  })
  assert.equal(storage.writes.length, 1)
  assert.deepEqual(storage.writes[0], {
    disk: 'public',
    path: 'users/42/attachment-id.jpg',
    body: new Uint8Array([1, 2, 3]),
    mimeType: 'image/jpeg',
  })
})

test('keeps drafts in memory until persist resolves their contextual options', async ({ assert }) => {
  const storage = new FakeStorage()
  const service = new AttachmentService({
    storage,
    queue: new FakeQueue(),
    defaultDisk: 'public',
    defaults: { disk: 'fs', folder: 'attachments' },
    createId: () => 'attachment-id',
  })
  const draft = service.createDraft({
    body: new Uint8Array([1, 2, 3]),
    originalName: 'avatar.jpg',
  })

  assert.isFalse(draft.isPersisted)
  assert.lengthOf(storage.writes, 0)

  const attachment = await draft.persist({
    options: {
      disk: 's3',
      folder: ({ model, field }) => `${model as string}/${field}`,
      rename: false,
    },
    context: { model: 'users/42', field: 'avatar' },
  })

  assert.equal(attachment, draft)
  assert.isTrue(draft.isPersisted)
  assert.deepEqual(draft.toJSON(), {
    id: 'attachment-id',
    disk: 's3',
    name: 'avatar.jpg',
    originalName: 'avatar.jpg',
    path: 'users/42/avatar/avatar.jpg',
    size: 3,
    extname: 'jpg',
    mimeType: 'application/octet-stream',
  })
  assert.deepEqual(storage.writes, [{
    disk: 's3',
    path: 'users/42/avatar/avatar.jpg',
    body: new Uint8Array([1, 2, 3]),
    mimeType: 'application/octet-stream',
  }])
})

test('extracts configured metadata only when meta is enabled', async ({ assert }) => {
  const storage = new FakeStorage()
  const service = new AttachmentService({
    storage,
    queue: new FakeQueue(),
    defaultDisk: 'public',
    createId: () => 'attachment-id',
    metadataExtractors: [
      {
        supports({ attachment }) {
          return attachment.mimeType === 'image/png'
        },
        async extract({ body }) {
          return { width: 800, bytes: body.byteLength }
        },
      },
    ],
  })

  const extracted = await service
    .createDraft({
      body: new Uint8Array([1, 2, 3]),
      originalName: 'avatar.png',
      mimeType: 'image/png',
      metadata: { width: 640, source: 'upload' },
    }, { meta: true })
    .persist()
  const skipped = await service
    .createDraft({ body: new Uint8Array([1]), originalName: 'document.pdf' })
    .persist()

  assert.deepEqual(extracted.metadata, { width: 640, bytes: 3, source: 'upload' })
  assert.isUndefined(skipped.metadata)
})

test('persists a draft only once when called concurrently', async ({ assert }) => {
  const storage = new FakeStorage()
  const service = new AttachmentService({
    storage,
    queue: new FakeQueue(),
    defaultDisk: 'public',
    createId: () => 'attachment-id',
  })
  const draft = service.createDraft({ body: new Uint8Array([1]), originalName: 'avatar.jpg' })

  const [first, second] = await Promise.all([draft.persist(), draft.persist()])

  assert.equal(first, second)
  assert.lengthOf(storage.writes, 1)
})

test('schedules variant generation without requiring a database or Lucid', async ({ assert }) => {
  const storage = new FakeStorage()
  const queue = new FakeQueue()
  const service = new AttachmentService({
    storage,
    queue,
    defaultDisk: 'public',
    createId: () => 'attachment-id',
  })
  const attachment = await service.create({ body: new Uint8Array(), originalName: 'report.pdf' })

  await service.scheduleVariantGeneration(attachment, ['thumbnail'], true)

  assert.deepEqual(queue.jobs, [
    { type: 'generate-variants', attachmentId: 'attachment-id', variantKeys: ['thumbnail'], meta: true },
  ])
})

test('resolves configured variant keys from manager, decorator, then defaults', async ({ assert }) => {
  const service = new AttachmentService({
    storage: new FakeStorage(),
    queue: new FakeQueue(),
    defaultDisk: 'public',
    defaults: { variants: ['config'] },
  })
  const managerDraft = service.createDraft(
    { body: new Uint8Array(), originalName: 'avatar.jpg' },
    { variants: ['manager'] }
  )
  const plainDraft = service.createDraft({ body: new Uint8Array(), originalName: 'avatar.jpg' })

  assert.deepEqual(service.getVariantKeys(managerDraft, { variants: ['decorator'] }), ['manager'])
  assert.deepEqual(service.getVariantKeys(plainDraft, { variants: ['decorator'] }), ['decorator'])
  assert.deepEqual(service.getVariantKeys(plainDraft), ['config'])
})

test('reads an attachment from the configured storage', async ({ assert }) => {
  const storage = new FakeStorage()
  const queue = new FakeQueue()
  const service = new AttachmentService({
    storage,
    queue,
    defaultDisk: 'public',
    createId: () => 'attachment-id',
  })
  const attachment = await service.create({ body: new Uint8Array(), originalName: 'report.pdf' })

  assert.deepEqual(await service.read(attachment), new Uint8Array([1, 2, 3]))
  assert.deepEqual(storage.reads, [{ disk: 'public', path: 'attachment-id.pdf' }])
})
