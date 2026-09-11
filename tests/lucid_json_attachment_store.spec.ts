import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import type { Attachment } from '../src/core/attachment.js'
import { AttachmentLifecycleService } from '../src/core/attachment_lifecycle_service.js'
import { AttachmentService } from '../src/core/attachment_service.js'
import type { AttachmentJob } from '../src/core/queue.js'
import { LucidJsonAttachmentStore } from '../src/integrations/lucid/json/lucid_json_attachment_store.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'

const owner = { type: 'users', id: '42', field: 'avatar' }
const gallery = { ...owner, field: 'gallery' }
const file = (): Attachment => {
  const id = randomUUID()
  return { id, disk: 'fs', name: `${id}.jpg`, path: `${id}.jpg`, originalName: 'photo.jpg', mimeType: 'image/jpeg', extname: 'jpg', size: 1 }
}
const legacy = { name: 'old.jpg', size: 1, extname: 'jpg', mimeType: 'image/jpeg', meta: { caption: 'été' }, custom: 'keep', variants: [
  { key: 'thumb', name: 'thumb.jpg', size: 1, extname: 'jpg', mimeType: 'image/jpeg' },
] }

test.group('Lucid JSON attachment store', (group) => {
  let db: Awaited<ReturnType<typeof createLucidTestDatabase>>
  const store = (kind: 'one' | 'many' = 'one', client = db.connection()) => new LucidJsonAttachmentStore({
    client, table: 'users', column: kind === 'one' ? 'avatar' : 'gallery', owner: kind === 'one' ? owner : gallery, kind, defaultDisk: 'fs',
  })
  group.setup(async () => {
    db = await createLucidTestDatabase({ createSchema: false })
    await db.connection().schema.createTable('users', (table) => {
      table.string('id').primary(); table.text('avatar'); table.text('gallery'); table.string('unrelated')
    })
  })
  group.each.setup(async () => {
    await db.from('users').delete()
    await db.table('users').insert({ id: '42', avatar: null, gallery: '[]', unrelated: 'keep' })
  })
  group.teardown(async () => { await db.manager.closeAll() })

  test('reads v5 without writes and adds stable IDs only on a later mutation', async ({ assert }) => {
    const serialized = JSON.stringify(legacy)
    await db.from('users').where('id', '42').update({ avatar: serialized })
    const adapter = store()
    const original = (await adapter.findOriginal(owner))!
    assert.equal(original.toAttachment().disk, 'fs')
    assert.deepEqual(original.toAttachment().metadata, legacy.meta)
    assert.equal((await db.from('users').first()).avatar, serialized)
    assert.equal((await store().findOriginal(owner))!.id, original.id)
    const variant = (await adapter.listVariants(original.id))[0]!
    assert.equal(variant.toAttachment().originalName, 'old.jpg')
    await adapter.persistMetadata(original.toAttachment(), { caption: 'updated' })
    const saved = JSON.parse((await db.from('users').first()).avatar)
    assert.equal(saved.id, original.id)
    assert.equal(saved.variants[0].id, variant.id)
    assert.equal(saved.custom, 'keep')
    assert.deepEqual(saved.meta, { caption: 'updated' })
    assert.notProperty(saved, 'metadata')
    assert.notProperty(saved, 'reference')
    assert.isFalse(await db.connection().schema.hasTable('adonis_attachments'))
  })

  test('orders, moves and removes collection entries by ID while preserving other columns', async ({ assert }) => {
    const adapter = store('many')
    const first = await adapter.createCollectionItem(gallery, file())
    const second = await adapter.createCollectionItem(gallery, file(), 0)
    assert.deepEqual((await adapter.listCollection(gallery)).map((item) => item.id), [second.id, first.id])
    await adapter.moveCollectionItem(gallery, first.id, 0)
    assert.deepEqual((await adapter.listCollection(gallery)).map((item) => item.id), [first.id, second.id])
    await adapter.removeCollectionItem(gallery, first)
    assert.equal((await adapter.listCollection(gallery))[0]!.position, 0)
    assert.equal((await db.from('users').first()).unrelated, 'keep')
  })

  test('serializes simultaneous inserts including an initially empty JSON collection', async ({ assert }) => {
    const files = Array.from({ length: 16 }, file)
    await Promise.all(files.map((attachment) => store('many').createCollectionItem(gallery, attachment)))
    assert.sameMembers((await store('many').listCollection(gallery)).map((entry) => entry.id), files.map((attachment) => attachment.id))
  })

  test('keeps nested writes and lifecycle file effects inside the outer transaction', async ({ assert }) => {
    const files = new Set<string>()
    const jobs: AttachmentJob[] = []
    const service = new AttachmentService({
      defaultDisk: 'fs', metadataMode: 'deferred', metadataExtractors: [{ async extract() { return {} } }],
      metadataPersister: store(), queue: { async enqueue(job) { jobs.push(job) } },
      storage: { async write(input) { files.add(input.path) }, async remove(input) { files.delete(input.path) }, async read() { return new Uint8Array([1]) } },
    })
    const lifecycle = new AttachmentLifecycleService(service, store())
    const old = await lifecycle.attach(owner, service.createDraft({ body: new Uint8Array([1]), originalName: 'old.jpg' }, { variants: [] }))
    const outer = await db.transaction()
    const draft = service.createDraft({ body: new Uint8Array([2]), originalName: 'new.jpg' }, { meta: true, variants: ['thumbnail'] })
    try {
      await new AttachmentLifecycleService(service, store('one', outer)).replace(owner, draft)
      assert.isTrue(files.has(old.toAttachment().path))
      assert.isTrue(files.has(draft.path))
      assert.isEmpty(jobs)
      await outer.rollback()
      assert.isTrue(files.has(old.toAttachment().path))
      assert.isFalse(files.has(draft.path))
      assert.isFalse(draft.isPersisted)
      assert.equal((await store().findOriginal(owner))!.id, old.id)
    } finally { if (!outer.isCompleted) await outer.rollback() }
    const replacement = await lifecycle.replace(owner, draft)
    assert.isFalse(files.has(old.toAttachment().path))
    assert.isTrue(files.has(replacement.toAttachment().path))
    assert.deepEqual(jobs.map((job) => job.reference), [replacement.toAttachment().reference, replacement.toAttachment().reference])
  })

  test('rolls back a caught nested failure without losing the preceding committed scope', async ({ assert }) => {
    const outer = await db.transaction()
    try {
      const adapter = store('many', outer)
      const first = await adapter.createCollectionItem(gallery, file())
      await assert.rejects(() => adapter.transaction(gallery, async (scoped) => {
        await scoped.createCollectionItem(gallery, file())
        throw new Error('abort nested')
      }), /abort nested/)
      await outer.commit()
      assert.deepEqual((await store('many').listCollection(gallery)).map((entry) => entry.id), [first.id])
    } finally { if (!outer.isCompleted) await outer.rollback() }
  })

  test('rejects stale variant and metadata writes after an original or variant is replaced', async ({ assert }) => {
    const adapter = store()
    const original = await adapter.createOriginal(owner, file())
    const first = await adapter.createVariant(original, 'thumbnail', file())
    const second = await adapter.replaceVariant(original, 'thumbnail', file())
    assert.notEqual(second.variant.id, first.id)
    await assert.rejects(() => adapter.persistMetadata(first.toAttachment(), { obsolete: true }), /not found/)
    await adapter.remove(original)
    const replacement = await adapter.createOriginal(owner, file())
    await assert.rejects(() => adapter.createVariant(original, 'late', file()), /not found/)
    assert.isNull(await adapter.findByReference(original.toAttachment().reference!))
    assert.isEmpty(await adapter.listVariants(replacement.id))
  })

  test('removes originals and variants together and rejects duplicate identities or shared locations', async ({ assert }) => {
    const adapter = store('many')
    const first = await adapter.createCollectionItem(gallery, file())
    const variant = await adapter.createVariant(first, 'thumbnail', file())
    await assert.rejects(() => adapter.createCollectionItem(gallery, { ...file(), path: first.toAttachment().path }), /distinct IDs and file locations/)
    await assert.rejects(() => adapter.createCollectionItem(gallery, first.toAttachment()), /cannot share/)
    const removed = await adapter.remove(first)
    assert.sameMembers(removed.map((item) => item.id), [first.id, variant.id])
    assert.isEmpty(await adapter.listCollection(gallery))
  })

  test('rejects foreign owners, missing rows, invalid documents and unsupported model synchronization before files are written', async ({ assert }) => {
    await assert.rejects(() => store().findByReference({ version: 1, adapter: 'json', id: 'x', owner: { ...owner, id: '43' } }), /does not match/)
    await assert.rejects(() => store().transaction({ ...owner, model: {} }, async () => {}), /synchronization/)
    await db.from('users').where('id', '42').update({ avatar: 'invalid-json' })
    const lifecycle = new AttachmentLifecycleService({ async create() { assert.fail('must not create a file'); return file() }, async remove() {} }, store())
    await assert.rejects(() => lifecycle.attach(owner, { body: new Uint8Array([1]), originalName: 'bad.jpg' }), /Invalid attachment JSON/)
    await db.from('users').delete()
    assert.isNull(await store().findById('missing'))
    await assert.rejects(() => store().createOriginal(owner, file()), /not found/)
  })

  test('protects existing original and variant bytes from same-name uploads and rollback', async ({ assert }) => {
    const bytes = new Map<string, number>()
    const service = new AttachmentService({
      defaultDisk: 'fs', queue: { async enqueue() {} },
      storage: {
        async write(value) { bytes.set(value.path, value.body[0]!) },
        async remove(value) { bytes.delete(value.path) },
        async read(value) { return new Uint8Array([bytes.get(value.path)!]) },
      },
    })
    const draft = (name: string, value: number) => service.createDraft({ body: new Uint8Array([value]), originalName: name }, { rename: false, variants: [] })
    const single = new AttachmentLifecycleService(service, store())
    await single.attach(owner, draft('avatar.jpg', 1))
    await assert.rejects(() => single.attach(owner, draft('avatar.jpg', 9)), /already has an attachment/)
    assert.equal(bytes.get('avatar.jpg'), 1)

    const collection = new AttachmentLifecycleService(service, store('many'))
    const original = await collection.add(gallery, draft('original.jpg', 2))
    const variantDraft = draft('thumb.jpg', 3)
    const variantAttachment = await variantDraft.persist()
    await store('many').createVariant(original, 'thumbnail', variantAttachment)
    const outer = await db.transaction()
    try {
      const scoped = new AttachmentLifecycleService(service, store('many', outer))
      const added = await scoped.add(gallery, draft('original.jpg', 8))
      assert.notEqual(added.toAttachment().path, 'original.jpg')
      const replacement = await scoped.replaceCollection(gallery, [draft('thumb.jpg', 7)])
      assert.notEqual(replacement[0]!.toAttachment().path, 'thumb.jpg')
      assert.equal(bytes.get('original.jpg'), 2)
      assert.equal(bytes.get('thumb.jpg'), 3)
      await outer.rollback()
      assert.equal(bytes.get('original.jpg'), 2)
      assert.equal(bytes.get('thumb.jpg'), 3)
      assert.lengthOf(await store('many').listCollection(gallery), 1)
      assert.equal(bytes.size, 3)
    } finally { if (!outer.isCompleted) await outer.rollback() }
  })
})
