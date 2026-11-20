/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import {
  AdonisAttachmentQueue,
  AttachmentJobProcessor,
  AttachmentService,
  type Attachment,
  type AttachmentJob,
  type VariantGenerationRequest,
} from '../index.js'

test.group('AdonisAttachmentQueue', () => {
  test('requires a dispatchable Adonis job', ({ assert }) => {
    assert.throws(
      () => new AdonisAttachmentQueue({ job: undefined as never }),
      'The Adonis attachment queue requires a job with a dispatch method'
    )
  })

  test('dispatches an attachment job to the configured queue', async ({ assert }) => {
    const calls: string[] = []
    const queue = new AdonisAttachmentQueue({
      queueName: 'attachments',
      job: {
        dispatch(payload) {
          calls.push(`dispatch:${payload.attachmentId}`)
          return {
            toQueue(name) {
              calls.push(`queue:${name}`)
              return this
            },
            async run() {
              calls.push('run')
            },
          }
        },
      },
    })

    await queue.enqueue({ type: 'generate-variants', attachmentId: 'attachment-id' })

    assert.deepEqual(calls, ['dispatch:attachment-id', 'queue:attachments', 'run'])
  })

  test('uses the job default queue when no queue name is configured', async ({ assert }) => {
    const calls: string[] = []
    const queue = new AdonisAttachmentQueue({
      job: {
        dispatch() {
          return {
            toQueue() {
              throw new Error('should not select a queue')
            },
            async run() {
              calls.push('run')
            },
          }
        },
      },
    })

    await queue.enqueue({ type: 'generate-variants', attachmentId: 'attachment-id' })

    assert.deepEqual(calls, ['run'])
  })

  test('routes a scheduled variant job using the original MIME type without changing the payload', async ({ assert }) => {
    const attachment: Attachment = {
      id: 'video-id',
      disk: 'public',
      name: 'video-id.mp4',
      originalName: 'clip.mp4',
      path: 'videos/video-id.mp4',
      size: 12,
      extname: 'mp4',
      mimeType: 'video/mp4',
    }
    const destinations: string[] = []
    const payloads: AttachmentJob[] = []
    const queue = new AdonisAttachmentQueue({
      queueName: (job, { mimeType }) =>
        job.type === 'generate-variants' && mimeType?.startsWith('video/') ? 'videos' : undefined,
      job: {
        dispatch(job) {
          payloads.push(job)
          return {
            toQueue(name) {
              destinations.push(name)
              return this
            },
            async run() {},
          }
        },
      },
    })
    const service = new AttachmentService({
      defaultDisk: 'public',
      queue,
      storage: { async read() { return new Uint8Array() }, async write() {}, async remove() {} },
    })

    await service.scheduleVariantGeneration(attachment)
    await queue.enqueue({ type: 'generate-variants', attachmentId: 'manual-id' })

    assert.deepEqual(destinations, ['videos'])
    assert.deepEqual(payloads, [
      { type: 'generate-variants', attachmentId: 'video-id' },
      { type: 'generate-variants', attachmentId: 'manual-id' },
    ])
  })

  test('gives the job queue precedence over the configured queue name', async ({ assert }) => {
    const calls: string[] = []
    const queue = new AdonisAttachmentQueue({
      queueName() {
        throw new Error('should not resolve a destination when the job declares one')
      },
      job: {
        options: {
          queue: 'priority-attachments',
        },
        dispatch() {
          calls.push('dispatch')
          return {
            toQueue() {
              throw new Error('should not override the job queue')
            },
            async run() {
              calls.push('run')
            },
          }
        },
      },
    })

    await queue.enqueue({ type: 'generate-variants', attachmentId: 'attachment-id' })

    assert.deepEqual(calls, ['dispatch', 'run'])
  })

  test('preserves the serialized payload through an external worker', async ({ assert }) => {
    const attachment: Attachment = {
      id: 'attachment-id',
      disk: 'public',
      name: 'attachment-id.jpg',
      originalName: 'avatar.jpg',
      path: 'users/42/attachment-id.jpg',
      size: 3,
      extname: 'jpg',
      mimeType: 'image/jpeg',
    }
    const generated: VariantGenerationRequest[] = []
    const processor = new AttachmentJobProcessor({
      attachments: {
        async findById(id) {
          return id === attachment.id ? attachment : null
        },
      },
      variants: {
        async generate(request) {
          generated.push(request)
        },
      },
    })
    let payload: AttachmentJob | undefined
    const queue = new AdonisAttachmentQueue({
      queueName: 'attachments',
      job: {
        dispatch(job) {
          payload = JSON.parse(JSON.stringify(job)) as AttachmentJob
          return {
            toQueue() {
              return this
            },
            async run() {
              await processor.process(payload!)
            },
          }
        },
      },
    })

    await queue.enqueue({
      type: 'generate-variants',
      attachmentId: attachment.id,
      variantKeys: ['thumbnail'],
      meta: true,
    })

    assert.deepEqual(payload, {
      type: 'generate-variants',
      attachmentId: attachment.id,
      variantKeys: ['thumbnail'],
      meta: true,
    })
    assert.deepEqual(generated, [{ attachment, variantKeys: ['thumbnail'], meta: true }])
  })
})
