/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import {
  AttachmentService,
  type AttachmentEventEmitter,
  type AttachmentEventName,
  type AttachmentEventPayload,
  type AttachmentQueue,
  type AttachmentStorage,
} from '../index.js'

class FakeEmitter implements AttachmentEventEmitter {
  events: Array<{ name: AttachmentEventName; payload: AttachmentEventPayload }> = []

  emit(name: AttachmentEventName, payload: AttachmentEventPayload): void {
    this.events.push({ name, payload })
  }
}

const storage: AttachmentStorage = {
  async write() {},
  async read() {
    return new Uint8Array()
  },
  async remove() {},
}

const queue: AttachmentQueue = { async enqueue() {} }

test.group('Attachment events', () => {
  test('emits file and synchronous metadata lifecycle events', async ({ assert }) => {
    const events = new FakeEmitter()
    const attachments = new AttachmentService({
      storage,
      queue,
      events,
      defaultDisk: 'fs',
      createId: () => 'attachment-id',
      metadataExtractors: [{ async extract() { return { width: 320 } } }],
    })

    const attachment = await attachments.createDraft({
      body: new Uint8Array([1]),
      originalName: 'avatar.png',
    }, { meta: true }).persist()
    await attachments.remove(attachment)

    assert.deepEqual(events.events.map(({ name }) => name), [
      'attachment:metadata_started',
      'attachment:metadata_completed',
      'attachment:created',
      'attachment:deleted',
    ])
    assert.equal(events.events[2]?.payload.attachment.id, 'attachment-id')
  })

  test('does not allow a failing observer to fail the attachment operation', async ({ assert }) => {
    const attachments = new AttachmentService({
      storage,
      queue,
      defaultDisk: 'fs',
      events: {
        emit() {
          throw new Error('observer unavailable')
        },
      },
    })

    const attachment = await attachments.create({
      body: new Uint8Array([1]),
      originalName: 'avatar.png',
    })

    assert.equal(attachment.name.endsWith('.png'), true)
  })
})
