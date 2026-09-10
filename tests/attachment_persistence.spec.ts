import { test } from '@japa/runner'
import type { Attachment } from '../src/core/attachment.js'
import { AttachmentLifecycleService } from '../src/core/attachment_lifecycle_service.js'
import type {
  AttachmentEntry, AttachmentRecord, AttachmentPersistence, AttachmentTransaction,
} from '../src/core/attachment_persistence.js'

const owner = { type: 'users', id: '42', field: 'avatar' }
const input = { body: new Uint8Array([1]), originalName: 'avatar.jpg' }
const attachment: Attachment = {
  id: 'file-id', disk: 'fs', path: 'avatar.jpg', name: 'avatar.jpg',
  originalName: 'avatar.jpg', size: 1, mimeType: 'image/jpeg', extname: 'jpg',
}

interface PlainEntry extends AttachmentEntry { adapterLabel: string }

/** Transaction double: no Lucid models, inheritance, database, or type assertions. */
function fixture(options: { failInsert?: boolean; existing?: boolean } = {}) {
  const events: string[] = []
  const entry: PlainEntry = {
    id: 'entry-id', attachmentId: attachment.id, adapterLabel: 'plain',
    toAttachment: () => attachment,
  }
  const record: AttachmentRecord = { id: attachment.id, toAttachment: () => attachment }
  const base: AttachmentPersistence<PlainEntry, AttachmentRecord> = {
    async createOriginal() {
      events.push('insert')
      if (options.failInsert) throw new Error('insert failed')
      return entry
    },
    async findOriginal() { return options.existing ? entry : null },
    async listVariants() { return [] },
    async releaseOwner() {},
    async restoreOwner() {},
    async remove() { events.push('delete'); return [record] },
    async listOwnerLinks() { return [] },
  }
  const store: AttachmentPersistence<PlainEntry, AttachmentRecord> &
    AttachmentTransaction<AttachmentPersistence<PlainEntry, AttachmentRecord>> = {
    ...base,
    isScoped: false,
    async transaction(currentOwner, callback) {
      const commits: Array<() => void | Promise<void>> = []
      const rollbacks: Array<() => void | Promise<void>> = []
      const scoped = {
        ...store, isScoped: true,
        afterCommit(effect: () => void | Promise<void>) { commits.push(effect) },
        afterRollback(effect: () => void | Promise<void>) { rollbacks.push(effect) },
      }
      events.push('begin')
      let result
      try {
        result = await callback(scoped, currentOwner)
      } catch (error) {
        events.push('rollback')
        for (const effect of rollbacks.reverse()) await effect()
        throw error
      }
      events.push('commit')
      for (const effect of commits) await effect()
      return result
    },
    afterCommit() { throw new Error('unscoped hook') },
    afterRollback() { throw new Error('unscoped hook') },
  }
  const files = {
    async create() { events.push('write'); return attachment },
    async remove() { events.push('remove file') },
  }
  return { base, store, files, events, entry }
}

test.group('Attachment persistence contracts', () => {
  test('uses a plain transactional adapter and preserves its result type', async ({ assert }) => {
    const { store, files, events, entry } = fixture()
    const service = new AttachmentLifecycleService(files, store)
    const result = await service.attach(owner, input)
    const label: string = result.adapterLabel
    assert.equal(label, 'plain')
    assert.strictEqual(result, entry)
    assert.deepEqual(events, ['begin', 'write', 'insert', 'commit'])
  })

  test('cleans up a failed insert only after the adapter confirms rollback', async ({ assert }) => {
    const { store, files, events } = fixture({ failInsert: true })
    await assert.rejects(() => new AttachmentLifecycleService(files, store).attach(owner, input), /insert failed/)
    assert.deepEqual(events, ['begin', 'write', 'insert', 'rollback', 'remove file'])
  })

  test('does not open another transaction inside an explicit lifecycle scope', async ({ assert }) => {
    const { store, files, events } = fixture()
    const service = new AttachmentLifecycleService(files, store)
    await assert.rejects(() => service.transaction(owner, async (scoped) => {
      await scoped.attach(owner, input)
      assert.deepEqual(events, ['begin', 'write', 'insert'])
      throw new Error('abort outer operation')
    }), /abort outer operation/)
    assert.deepEqual(events, ['begin', 'write', 'insert', 'rollback', 'remove file'])
  })

  test('defers deletion of the old file until commit and retains it on rollback', async ({ assert }) => {
    for (const abort of [false, true]) {
      const { store, files, events } = fixture({ existing: true })
      const service = new AttachmentLifecycleService(files, store)
      const run = () => service.transaction(owner, async (scoped) => {
        await scoped.detach(owner)
        assert.deepEqual(events, ['begin', 'delete'])
        if (abort) throw new Error('abort deletion')
      })
      if (abort) await assert.rejects(run, /abort deletion/)
      else await run()
      assert.deepEqual(events, abort ? ['begin', 'delete', 'rollback'] : ['begin', 'delete', 'commit', 'remove file'])
    }
  })

  test('retains compatibility with custom stores without transaction support', async ({ assert }) => {
    const { base, files, events } = fixture({ existing: true })
    await new AttachmentLifecycleService(files, base).detach(owner)
    assert.deepEqual(events, ['delete', 'remove file'])
  })

  test('rejects incomplete transaction support before creating files', ({ assert }) => {
    const { base, files, events } = fixture()
    assert.throws(() => new AttachmentLifecycleService(files, { ...base, isScoped: true }), /complete transaction capability/)
    assert.isEmpty(events)
  })

  test('rejects an adapter that passes an unscoped store to its transaction callback', async ({ assert }) => {
    const { store, files, events } = fixture()
    store.transaction = async (currentOwner, callback) => callback(store, currentOwner)
    await assert.rejects(() => new AttachmentLifecycleService(files, store).attach(owner, input), /transaction-scoped store/)
    assert.isEmpty(events)
  })

  test('keeps collections and shared links as explicit optional capabilities', async ({ assert }) => {
    const { base, files, events } = fixture()
    const service = new AttachmentLifecycleService(files, base)
    assert.throws(() => service.listCollection(owner), /collection-capable store/)
    assert.throws(() => service.attachExisting(owner, 'another-id'), /link-capable store/)
    assert.isEmpty(events)
  })
})
