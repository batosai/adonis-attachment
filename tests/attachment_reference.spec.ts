import { test } from '@japa/runner'
import {
  AttachmentRepositoryRegistry, AttachmentJobProcessor, AttachmentService,
  AttachmentNotFoundError, AdonisAttachmentQueue,
  parseAttachmentReference, resolveAttachment, withAttachmentReference, toPersistedAttachment,
  type Attachment, type AttachmentReference, type AttachmentJob, type VariantGenerationRequest,
} from '../index.js'
import { LucidAttachmentRepository } from '../src/integrations/lucid/persistence/lucid_attachment_repository.js'
import { LucidAttachmentMetadataPersister } from '../src/integrations/lucid/persistence/lucid_attachment_metadata_persister.js'
import { LucidVariantGenerationService } from '../src/integrations/lucid/persistence/lucid_variant_generation_service.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/persistence/lucid_attachment_store.js'

const attachment: Attachment = {
  id: 'file-42', disk: 'fs', path: 'avatar.jpg', name: 'avatar.jpg', originalName: 'avatar.jpg',
  size: 1, mimeType: 'image/jpeg', extname: 'jpg',
}
const reference: AttachmentReference = {
  version: 1, adapter: 'json', id: attachment.id,
  owner: { type: 'users', id: '42', field: 'avatar' },
}

test.group('Attachment references', () => {
  test('round-trips a locator through JSON and keeps it out of persisted fields', ({ assert }) => {
    const parsed = parseAttachmentReference(JSON.parse(JSON.stringify(reference)))
    assert.deepEqual(parsed, reference)
    assert.notStrictEqual(parsed.owner, reference.owner)
    const contextual = withAttachmentReference({ ...attachment, url: '/runtime-url' }, parsed)
    assert.deepEqual(toPersistedAttachment(contextual), attachment)
    assert.notProperty(attachment, 'reference')
  })

  test('rejects unsupported versions, malformed IDs and physical SQL addresses', ({ assert }) => {
    for (const invalid of [
      null, [], {}, { ...reference, version: 2 }, { ...reference, adapter: '' },
      { ...reference, adapter: '../json' }, { ...reference, id: '' },
      { ...reference, id: 'a'.repeat(1025) }, { ...reference, table: 'users' },
      { ...reference, owner: null }, { ...reference, owner: { ...reference.owner, model: {} } },
      { ...reference, owner: { ...reference.owner, lock: { table: 'users', column: 'id', value: '42' } } },
    ]) assert.throws(() => parseAttachmentReference(invalid), /Invalid attachment reference/)
    assert.throws(() => withAttachmentReference(attachment, { ...reference, id: 'other' }), /does not match/)
  })

  test('routes identical IDs to distinct registered adapters without changing legacy lookups', async ({ assert }) => {
    const calls: string[] = []
    const registry = new AttachmentRepositoryRegistry({
      legacy: { async findById(id) { calls.push(`legacy:${id}`); return attachment } },
      adapters: {
        tables: { async findByReference() { calls.push('tables'); return { ...attachment, path: 'table.jpg' } } },
        json: { async findByReference(value) { assert.deepEqual(value.owner, reference.owner); calls.push('json'); return attachment } },
      },
    })
    assert.equal((await resolveAttachment(registry, attachment.id, reference))!.path, 'avatar.jpg')
    assert.equal((await resolveAttachment(registry, attachment.id, { version: 1, adapter: 'tables', id: attachment.id }))!.path, 'table.jpg')
    assert.strictEqual(await resolveAttachment(registry, attachment.id), attachment)
    assert.deepEqual(calls, ['json', 'tables', 'legacy:file-42'])
  })

  test('does not fall back when an adapter is missing, an owner disappeared, or a repository lacks support', async ({ assert }) => {
    let legacyCalls = 0
    const legacy = { async findById() { legacyCalls++; return attachment } }
    const registry = new AttachmentRepositoryRegistry({ legacy, adapters: { json: { async findByReference() { return null } } } })
    await assert.rejects(() => resolveAttachment(registry, attachment.id, { ...reference, adapter: 'unknown' }), /not registered/)
    await assert.rejects(() => resolveAttachment(legacy, attachment.id, reference), /reference-capable/)
    assert.isNull(await resolveAttachment(registry, attachment.id, reference))
    assert.equal(legacyCalls, 0)
  })

  test('rejects conflicting job and result identities', async ({ assert }) => {
    let resolutions = 0
    const repository = {
      async findById() { throw new Error('wrong fallback') },
      async findByReference() { resolutions++; return { ...attachment, id: 'wrong-id' } },
    }
    await assert.rejects(() => resolveAttachment(repository, 'another-id', reference), /does not match/)
    assert.equal(resolutions, 0)
    await assert.rejects(() => resolveAttachment(repository, attachment.id, reference), /different attachment ID/)
  })

  test('transports contextual jobs through the Adonis queue into a fresh processor', async ({ assert }) => {
    const payloads: AttachmentJob[] = []
    const queue = new AdonisAttachmentQueue({ job: {
      dispatch(payload) {
        const serialized = JSON.stringify(payload)
        return {
          toQueue() { return this },
          async run() { payloads.push(JSON.parse(serialized)) },
        }
      },
    } })
    const service = new AttachmentService({
      defaultDisk: 'fs', queue,
      storage: { async write() {}, async read() { return new Uint8Array([1]) }, async remove() {} },
      metadataExtractors: [{ async extract() { return { width: 1 } } }],
      metadataPersister: { async persistMetadata() {} },
    })
    const contextual = withAttachmentReference(attachment, reference)
    await service.scheduleVariantGeneration(contextual, ['thumbnail'], true, undefined, 'replace')
    await service.scheduleMetadataExtraction(contextual)
    assert.lengthOf(payloads, 2)
    assert.deepEqual(payloads.map((job) => job.reference), [reference, reference])

    const variants: VariantGenerationRequest[] = []
    const metadata: Attachment[] = []
    const processor = new AttachmentJobProcessor({
      attachments: new AttachmentRepositoryRegistry({
        legacy: { async findById() { throw new Error('wrong fallback') } },
        adapters: { json: { async findByReference(value) {
          assert.deepEqual(value, reference)
          return { ...attachment, path: 'current-avatar.jpg' }
        } } },
      }),
      variants: { async generate(request) { variants.push(request) } },
      metadata: { async extractAndPersistMetadata(value) { metadata.push(value) } },
    })
    for (const job of payloads) await processor.process(job)
    assert.deepEqual(variants, [{ attachment: { ...attachment, path: 'current-avatar.jpg', reference }, variantKeys: ['thumbnail'], meta: true, mode: 'replace' }])
    assert.deepEqual(metadata, [{ ...attachment, path: 'current-avatar.jpg', reference }])
  })

  test('does not process stale contextual jobs after the owner attachment was replaced', async ({ assert }) => {
    const processor = new AttachmentJobProcessor({
      attachments: { async findById() { throw new Error('wrong fallback') }, async findByReference() { return null } },
      variants: { async generate() { assert.fail('must not generate files') } },
      metadata: { async extractAndPersistMetadata() { assert.fail('must not write metadata') } },
    })
    await assert.rejects(() => processor.process({ type: 'generate-variants', attachmentId: attachment.id, reference }), AttachmentNotFoundError)
    await assert.rejects(() => processor.process({ type: 'extract-metadata', attachmentId: attachment.id, attachment, reference }), AttachmentNotFoundError)
  })

  test('accepts a metadata locator embedded in the attachment and rejects conflicting locators', async ({ assert }) => {
    let calls = 0
    const processor = new AttachmentJobProcessor({
      attachments: { async findById() { throw new Error('wrong fallback') }, async findByReference() { calls++; return attachment } },
      variants: { async generate() {} },
      metadata: { async extractAndPersistMetadata(value) { assert.deepEqual(value.reference, reference) } },
    })
    const contextual = withAttachmentReference(attachment, reference)
    await processor.process({ type: 'extract-metadata', attachmentId: attachment.id, attachment: contextual })
    await assert.rejects(() => processor.process({
      type: 'extract-metadata', attachmentId: attachment.id, attachment: contextual,
      reference: { ...reference, owner: { type: 'users', id: '43', field: 'avatar' } },
    }), /conflicting attachment references/)
    await assert.rejects(() => processor.process({
      type: 'extract-metadata', attachmentId: attachment.id, attachment: { ...attachment, id: 'wrong' }, reference,
    }), /conflicting attachment IDs/)
    assert.equal(calls, 1)
  })

  test('keeps contextual metadata when delegating to its configured persister', async ({ assert }) => {
    const contextual = withAttachmentReference(attachment, reference)
    const service = new AttachmentService({
      defaultDisk: 'fs', queue: { async enqueue() {} },
      storage: { async write() {}, async remove() {}, async read() { return new Uint8Array([1]) } },
      metadataExtractors: [{ async extract() { return { width: 10 } } }],
      metadataPersister: { async persistMetadata(value, metadata) {
        assert.deepEqual(value.reference, reference)
        assert.deepEqual(metadata, { width: 10 })
      } },
    })
    await service.extractAndPersistMetadata(contextual)
  })

  test('rejects malformed serialized references instead of treating them as legacy jobs', async ({ assert }) => {
    let calls = 0
    const processor = new AttachmentJobProcessor({
      attachments: {
        async findById() { calls++; return attachment },
        async findByReference() { calls++; return attachment },
      },
      variants: { async generate() { calls++ } },
      metadata: { async extractAndPersistMetadata() { calls++ } },
    })
    for (const type of ['generate-variants', 'extract-metadata']) {
      const invalid: AttachmentJob = JSON.parse(JSON.stringify({ type, attachmentId: attachment.id, attachment, reference: null }))
      await assert.rejects(() => processor.process(invalid), /Invalid attachment reference/)
    }
    assert.equal(calls, 0)
  })

  test('tables-only services reject JSON references before any database or conversion call', async ({ assert }) => {
    const contextual = withAttachmentReference(attachment, reference)
    await assert.rejects(() => new LucidAttachmentRepository().findByReference(reference), /tables reference/)
    await assert.rejects(() => new LucidAttachmentMetadataPersister().persistMetadata(contextual, {}), /cannot consume/)
    const variants = new LucidVariantGenerationService({
      attachments: { async remove() { assert.fail('must not delete files') } },
      generator: { async generateAll() { assert.fail('must not generate files'); return [] } },
      store: new LucidAttachmentStore(),
    })
    await assert.rejects(() => variants.generate({ attachment: contextual }), /cannot consume/)
  })
})
