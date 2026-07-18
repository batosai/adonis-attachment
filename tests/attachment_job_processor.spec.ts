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
    })

    assert.deepEqual(variants.requests, [{ attachment, variantKeys: ['thumbnail'] }])
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
})
