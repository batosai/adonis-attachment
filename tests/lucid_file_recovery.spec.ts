import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from '@adonisjs/lucid/database'
import { test } from '@japa/runner'
import { LocalFileStorage } from '../src/adapters/local_file_storage.js'
import { AttachmentService } from '../src/core/attachment_service.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/persistence/lucid_attachment_store.js'
import { LucidAttachmentLifecycleService } from '../src/integrations/lucid/persistence/lucid_attachment_lifecycle_service.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'
import { VariantGenerationService } from '../src/variants/variant_generation_service.js'
import { LucidVariantGenerationService } from '../src/integrations/lucid/persistence/lucid_variant_generation_service.js'

const owner = { type: 'users', id: '42', field: 'avatar' }

test.group('Lucid file recovery', (group) => {
  let database: Database
  let directory: string
  let service: AttachmentService
  let store: LucidAttachmentStore
  let lifecycle: LucidAttachmentLifecycleService

  group.each.setup(async () => {
    database = await createLucidTestDatabase()
    directory = await mkdtemp(join(tmpdir(), 'attachment-recovery-'))
    service = new AttachmentService({
      storage: new LocalFileStorage({ location: directory }),
      defaultDisk: 'fs',
      queue: { async enqueue() {} },
    })
    store = new LucidAttachmentStore()
    lifecycle = new LucidAttachmentLifecycleService(service, store)
  })

  group.each.teardown(async () => {
    await database.manager.closeAll()
    await rm(directory, { recursive: true, force: true })
  })

  function draft(content: string) {
    return service.createDraft({ body: Buffer.from(content), originalName: 'photo.png' }, { rename: false })
  }

  test('does not enqueue deferred variant metadata when its policy is disabled', async ({ assert }) => {
    const jobs: string[] = []
    const original = await lifecycle.attach(owner, draft('original'))
    const attachments = new AttachmentService({
      storage: new LocalFileStorage({ location: directory }), defaultDisk: 'fs',
      defaults: { meta: true }, metadataMode: 'deferred', metadataVariants: false,
      metadataExtractors: [{ async extract() { return {} } }],
      metadataPersister: { async persistMetadata() {} },
      queue: { async enqueue(job) { jobs.push(job.type) } },
    })
    const generator = new LucidVariantGenerationService({
      attachments, store,
      generator: new VariantGenerationService({ attachments, converters: [{ key: 'thumb', async convert() {
        return { body: Buffer.from('variant'), fileName: 'thumb.png', mimeType: 'image/png' }
      } }] }),
    })
    await generator.generate({ attachment: original.toAttachment(), meta: true })
    assert.lengthOf(await store.listVariants(original.attachmentId), 1)
    assert.isEmpty(jobs)
  })

  test('removes variant files including late writes after a conversion failure', async ({ assert }) => {
    const original = await lifecycle.attach(owner, draft('original'))
    const generator = new LucidVariantGenerationService({
      attachments: service, store,
      generator: new VariantGenerationService({
        attachments: service,
        converters: [
          { key: 'good', async convert() {
            await new Promise((resolve) => setTimeout(resolve, 10))
            return { body: Buffer.from('variant'), fileName: 'thumb.png', mimeType: 'image/png' }
          } },
          { key: 'bad', async convert() { throw new Error('converter failed') } },
        ],
      }),
    })
    await assert.rejects(() => generator.generate({ attachment: original.toAttachment() }), 'converter failed')
    assert.deepEqual(await readdir(directory), ['photo.png'])
    assert.isEmpty(await store.listVariants(original.attachmentId))
  })

  test('removes remaining generated files after a variant row fails to persist', async ({ assert }) => {
    const original = await lifecycle.attach(owner, draft('original'))
    const createVariant = store.createVariant.bind(store)
    store.createVariant = async (...args) => {
      if (args[1] === 'second') throw new Error('variant insert failed')
      return createVariant(...args)
    }
    const generator = new LucidVariantGenerationService({
      attachments: service, store,
      generator: new VariantGenerationService({
        attachments: service,
        converters: ['first', 'second', 'third'].map((key) => ({
          key, async convert() { return { body: Buffer.from(key), fileName: `${key}.png`, mimeType: 'image/png' } },
        })),
      }),
    })
    await assert.rejects(() => generator.generate({ attachment: original.toAttachment() }), 'variant insert failed')
    const variants = await store.listVariants(original.attachmentId)
    assert.deepEqual(variants.map((item) => item.variantKey), ['first'])
    assert.sameMembers(await readdir(directory), ['photo.png', variants[0]!.name])
    assert.equal(Buffer.from(await service.read(variants[0]!.toAttachment())).toString(), 'first')
  })

  test('rewrites the same draft when retried after a database failure', async ({ assert }) => {
    const pending = draft('retry')
    const createOriginal = store.createOriginal.bind(store)
    store.createOriginal = async () => { throw new Error('insert failed') }
    await assert.rejects(() => lifecycle.attach(owner, pending), 'insert failed')
    assert.isFalse(pending.isPersisted)
    store.createOriginal = createOriginal
    const result = await lifecycle.attach(owner, pending)
    assert.equal(Buffer.from(await service.read(result.toAttachment())).toString(), 'retry')
    assert.isTrue(pending.isPersisted)
    assert.throws(() => pending.source, 'source is no longer available')
  })

  test('rewrites a draft reused after transaction rollback', async ({ assert }) => {
    const pending = draft('retry rollback')
    const trx = await database.transaction()
    await new LucidAttachmentLifecycleService(service, new LucidAttachmentStore(undefined, { client: trx }))
      .attach({ ...owner, model: { $trx: trx } }, pending)
    await trx.rollback()
    assert.isFalse(pending.isPersisted)
    const result = await lifecycle.attach(owner, pending)
    assert.equal(Buffer.from(await service.read(result.toAttachment())).toString(), 'retry rollback')
  })

  test('retries every draft after a collection replacement insertion fails', async ({ assert }) => {
    const drafts = [draft('first'), draft('second')]
    const createCollectionItem = store.createCollectionItem.bind(store)
    let calls = 0
    store.createCollectionItem = async (...args) => {
      if (++calls === 2) throw new Error('second insert failed')
      return createCollectionItem(...args)
    }
    await assert.rejects(() => lifecycle.replaceCollection(owner, drafts), 'second insert failed')
    assert.isTrue(drafts.every((item) => !item.isPersisted))
    store.createCollectionItem = createCollectionItem
    const items = await lifecycle.replaceCollection(owner, drafts)
    assert.deepEqual(await Promise.all(items.map(async (item) =>
      Buffer.from(await service.read(item.toAttachment())).toString()
    )), ['first', 'second'])
  })

  test('replaces a same-name file without deleting the new bytes', async ({ assert }) => {
    const first = await lifecycle.attach(owner, draft('old'))
    const second = await lifecycle.replace(owner, draft('new'))
    assert.equal(second.toAttachment().name, 'photo.png')
    assert.notEqual(second.toAttachment().path, first.toAttachment().path)
    assert.equal(Buffer.from(await service.read(second.toAttachment())).toString(), 'new')
    await assert.rejects(() => service.read(first.toAttachment()))
  })

  test('preserves a same-name file when replacement insertion fails', async ({ assert }) => {
    const first = await lifecycle.attach(owner, draft('old'))
    store.createOriginal = async () => { throw new Error('insert failed') }
    await assert.rejects(() => lifecycle.replace(owner, draft('new')), 'insert failed')
    assert.equal((await store.findOriginal(owner))?.attachmentId, first.attachmentId)
    assert.equal(Buffer.from(await service.read(first.toAttachment())).toString(), 'old')
  })

  test('keeps the previous bytes when a same-name replacement rolls back', async ({ assert }) => {
    const first = await lifecycle.attach(owner, draft('old'))
    const trx = await database.transaction()
    const transactional = new LucidAttachmentLifecycleService(service, new LucidAttachmentStore(undefined, { client: trx }))
    const second = await transactional.replace({ ...owner, model: { $trx: trx } }, draft('new'))
    assert.equal(Buffer.from(await service.read(first.toAttachment())).toString(), 'old')
    await trx.rollback()
    assert.equal((await store.findOriginal(owner))?.attachmentId, first.attachmentId)
    assert.equal(Buffer.from(await service.read(first.toAttachment())).toString(), 'old')
    await assert.rejects(() => service.read(second.toAttachment()))
  })
})
