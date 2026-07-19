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

  await service.scheduleVariantGeneration(attachment, ['thumbnail'])

  assert.deepEqual(queue.jobs, [
    { type: 'generate-variants', attachmentId: 'attachment-id', variantKeys: ['thumbnail'] },
  ])
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
