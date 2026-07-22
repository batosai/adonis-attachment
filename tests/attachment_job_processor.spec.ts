/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import {
  AttachmentJobProcessor,
  AttachmentNotFoundError,
  DeferredMetadataProcessorNotConfiguredError,
  type Attachment,
  type AttachmentRepository,
  type VariantGenerationRequest,
  type VariantGenerator,
  type AttachmentEventEmitter,
  type AttachmentEventName,
  type AttachmentEventPayload,
} from '../index.js'

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

class FakeRepository implements AttachmentRepository {
  constructor(private readonly value: Attachment | null) {}

  async findById(): Promise<Attachment | null> {
    return this.value
  }
}

class FakeVariantGenerator implements VariantGenerator {
  requests: VariantGenerationRequest[] = []

  async generate(request: VariantGenerationRequest): Promise<void> {
    this.requests.push(request)
  }
}

class FakeEmitter implements AttachmentEventEmitter {
  events: Array<{ name: AttachmentEventName; payload: AttachmentEventPayload }> = []

  emit(name: AttachmentEventName, payload: AttachmentEventPayload): void {
    this.events.push({ name, payload })
  }
}

test.group('AttachmentJobProcessor', () => {
  test('resolves an attachment before delegating variant generation', async ({ assert }) => {
    const variants = new FakeVariantGenerator()
    const processor = new AttachmentJobProcessor({
      attachments: new FakeRepository(attachment),
      variants,
    })

    await processor.process({
      type: 'generate-variants',
      attachmentId: 'attachment-id',
      variantKeys: ['thumbnail'],
      meta: true,
    })

    assert.deepEqual(variants.requests, [{ attachment, variantKeys: ['thumbnail'], meta: true }])
  })

  test('fails a job when its attachment no longer exists', async ({ assert }) => {
    const processor = new AttachmentJobProcessor({
      attachments: new FakeRepository(null),
      variants: new FakeVariantGenerator(),
    })

    await assert.rejects(
      () => processor.process({ type: 'generate-variants', attachmentId: 'missing' }),
      AttachmentNotFoundError
    )
  })

  test('resolves a deferred variant generator once when a job is processed', async ({ assert }) => {
    let resolutions = 0
    const requests: string[] = []
    const processor = new AttachmentJobProcessor({
      attachments: {
        async findById(id) {
          return {
            id,
            disk: 'public',
            path: 'users/42/avatar.jpg',
            name: 'avatar.jpg',
            originalName: 'profile.jpg',
            mimeType: 'image/jpeg',
            extname: 'jpg',
            size: 42,
          }
        },
      },
      async variants() {
        resolutions += 1
        return {
          async generate({ attachment }) {
            requests.push(attachment.id)
          },
        }
      },
    })

    assert.equal(resolutions, 0)

    await processor.process({ type: 'generate-variants', attachmentId: 'first-id' })
    await processor.process({ type: 'generate-variants', attachmentId: 'second-id' })

    assert.equal(resolutions, 1)
    assert.deepEqual(requests, ['first-id', 'second-id'])
  })

  test('delegates deferred metadata jobs without resolving the repository', async ({ assert }) => {
    const processed: Attachment[] = []
    const processor = new AttachmentJobProcessor({
      attachments: new FakeRepository(null),
      variants: new FakeVariantGenerator(),
      metadata: {
        async extractAndPersistMetadata(value) {
          processed.push(value)
        },
      },
    })

    await processor.process({ type: 'extract-metadata', attachmentId: attachment.id, attachment })

    assert.deepEqual(processed, [attachment])
  })

  test('preserves the v5 variant events and adds the failed job error', async ({ assert }) => {
    const events = new FakeEmitter()
    const variants = new FakeVariantGenerator()
    const processor = new AttachmentJobProcessor({
      attachments: new FakeRepository(attachment),
      variants,
      events,
    })
    const eventContext = {
      tableName: 'users',
      attributeName: 'avatar',
      primary: { key: 'id', value: '42' },
    }

    await processor.process({
      type: 'generate-variants',
      attachmentId: attachment.id,
      variantKeys: ['thumbnail'],
      eventContext,
    })

    assert.deepEqual(events.events.map(({ name }) => name), [
      'attachment:variant_started',
      'attachment:variant_completed',
    ])
    assert.deepEqual(events.events[0]?.payload, {
      ...eventContext,
      attachment,
      variants: ['thumbnail'],
    })

    const failed = new AttachmentJobProcessor({
      attachments: new FakeRepository(attachment),
      events,
      variants: {
        async generate() {
          throw Object.assign(new Error('conversion failed'), { code: 'E_CONVERSION_FAILED' })
        },
      },
    })
    await assert.rejects(
      () => failed.process({ type: 'generate-variants', attachmentId: attachment.id, eventContext }),
      'conversion failed'
    )

    assert.deepEqual(events.events.at(-1), {
      name: 'attachment:variant_failed',
      payload: {
        ...eventContext,
        attachment,
        error: { message: 'conversion failed', code: 'E_CONVERSION_FAILED' },
      },
    })
  })

  test('rejects deferred metadata jobs without a metadata processor', async ({ assert }) => {
    const processor = new AttachmentJobProcessor({
      attachments: new FakeRepository(attachment),
      variants: new FakeVariantGenerator(),
    })

    await assert.rejects(
      () => processor.process({ type: 'extract-metadata', attachmentId: attachment.id, attachment }),
      DeferredMetadataProcessorNotConfiguredError
    )
  })
})
