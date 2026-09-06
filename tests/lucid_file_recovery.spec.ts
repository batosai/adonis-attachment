import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from '@adonisjs/lucid/database'
import { test } from '@japa/runner'
import { LocalFileStorage } from '../src/adapters/local_file_storage.js'
import { AttachmentService } from '../src/core/attachment_service.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/persistence/lucid_attachment_store.js'
import { LucidAttachmentLifecycleService } from '../src/integrations/lucid/persistence/lucid_attachment_lifecycle_service.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'

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
