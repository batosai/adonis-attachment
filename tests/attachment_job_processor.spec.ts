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
  type Attachment,
  type AttachmentRepository,
  type VariantGenerationRequest,
  type VariantGenerator,
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
})
