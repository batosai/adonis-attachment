import { test } from '@japa/runner'
import { AttachmentService } from '../src/core/attachment_service.js'
import { createLucidAttachmentProcessor } from '../src/integrations/lucid/create_lucid_attachment_processor.js'
import type { AttachmentProcessingAdapter } from '../src/core/attachment_processing_adapter.js'
import type { Attachment } from '../src/core/attachment.js'

test('routes contextual jobs through a format-independent processing adapter', async ({ assert }) => {
  const file: Attachment = { id: 'custom-file', disk: 'fs', path: 'custom.jpg', name: 'custom.jpg', originalName: 'custom.jpg',
    size: 1, extname: 'jpg', mimeType: 'image/jpeg' }
  const service = new AttachmentService({ defaultDisk: 'fs', queue: { async enqueue() {} }, storage: {
    async write() {}, async read() { return new Uint8Array([1]) }, async remove() {},
  } })
  let lookups = 0
  let generated = 0
  const adapter: AttachmentProcessingAdapter = {
    name: 'custom', repository: { async findByReference(reference) { lookups++; assert.equal(reference.adapter, 'custom'); return file } },
    metadataPersister: { async persistMetadata() {} },
    variants(attachments) {
      assert.strictEqual(attachments, service)
      return { async generate(request) { generated++; assert.equal(request.attachment.reference?.adapter, 'custom') } }
    },
  }
  const worker = createLucidAttachmentProcessor({ container: { async make() { return service } } } as never, {
    adapters: { custom: adapter }, converters: { async keys() { return [] }, async get() { return undefined } },
  })
  await worker.process({ type: 'generate-variants', attachmentId: file.id,
    reference: { version: 1, adapter: 'custom', id: file.id } })
  assert.equal(lookups, 1); assert.equal(generated, 1)
})

test('does not resolve unregistered contextual adapters through the table repository', async ({ assert }) => {
  const worker = createLucidAttachmentProcessor({ container: { hasBinding() { return false },
    async make() { throw new Error('Must not resolve an attachment service for an unknown adapter') },
  } } as never)
  await assert.rejects(() => worker.process({ type: 'generate-variants', attachmentId: 'missing',
    reference: { version: 1, adapter: 'custom', id: 'missing' } }), /adapter "custom" is not registered/)
})
