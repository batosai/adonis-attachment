import { test } from '@japa/runner'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'
import type { Attachment } from '../src/core/attachment.js'
import type { AttachmentTransaction } from '../src/core/attachment_persistence.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/persistence/lucid_attachment_store.js'
import { LucidAttachmentLifecycleService, type LucidAttachmentPersistence } from '../src/integrations/lucid/persistence/lucid_attachment_lifecycle_service.js'
import {
  attachmentTransaction, afterAttachmentCommit, afterAttachmentRollback,
  AttachmentCommitError, AttachmentPostCommitError,
} from '../src/integrations/lucid/persistence/attachment_transaction.js'

test('preserves outer SQL rollback through a structural adapter and the Lucid lifecycle facade', async ({ assert }) => {
  const database = await createLucidTestDatabase()
  const outer = await database.transaction()
  const effects: string[] = []
  const attachment: Attachment = {
    id: 'structural-file', disk: 'fs', path: 'structural.jpg', name: 'structural.jpg',
    originalName: 'structural.jpg', size: 1, mimeType: 'image/jpeg', extname: 'jpg',
  }
  // Deliberately neither a subclass nor an instanceof LucidAttachmentStore.
  const wrap = (store: LucidAttachmentStore): LucidAttachmentPersistence & AttachmentTransaction<LucidAttachmentPersistence> => ({
    isScoped: store.isScoped,
    transaction: (owner, callback) => store.transaction(owner, (scoped) => callback(wrap(scoped), owner)),
    afterCommit: store.afterCommit.bind(store),
    afterRollback: store.afterRollback.bind(store),
    createOriginal: store.createOriginal.bind(store),
    findOriginal: store.findOriginal.bind(store),
    listVariants: store.listVariants.bind(store),
    releaseOwner: store.releaseOwner.bind(store),
    restoreOwner: store.restoreOwner.bind(store),
    remove: store.remove.bind(store),
    listOwnerLinks: store.listOwnerLinks.bind(store),
  })
  try {
    const adapter = wrap(new LucidAttachmentStore(undefined, { client: outer }))
    assert.isFalse(adapter instanceof LucidAttachmentStore)
    const lifecycle = new LucidAttachmentLifecycleService({
      async create() { effects.push('write'); return attachment },
      async remove() { effects.push('cleanup') },
    }, adapter)
    await lifecycle.transaction({ type: 'users', id: '42', field: 'avatar' }, async (scoped) => {
      assert.instanceOf(scoped, LucidAttachmentLifecycleService)
      const link = await scoped.attach({ type: 'users', id: '42', field: 'avatar' }, {
        body: new Uint8Array([1]), originalName: 'structural.jpg',
      })
      assert.equal(link.attachment.id, attachment.id)
      assert.isFunction(link.save)
    })
    assert.deepEqual(effects, ['write'])
    await outer.rollback()
    assert.deepEqual(effects, ['write', 'cleanup'])
    assert.isNull(await new LucidAttachmentStore().findById(attachment.id))
  } finally {
    if (!outer.isCompleted) await outer.rollback()
    await database.manager.closeAll()
  }
})

test('uses Oracle savepoints without committing the shared connection and isolates nested effects', async ({ assert }) => {
  const sql: string[] = []
  const effects: string[] = []
  const hooks = new Map<string, () => Promise<void>>()
  const parent = {
    isTransaction: true, dialect: { name: 'oracledb' },
    async rawQuery(statement: string) { sql.push(statement) },
    async transaction() { throw new Error('Must not invoke Knex nested Oracle transactions') },
    after(event: string, callback: () => Promise<void>) { hooks.set(event, callback) },
  } as unknown as TransactionClientContract
  await attachmentTransaction(parent, async (outer) => {
    afterAttachmentCommit(outer, () => { effects.push('commit outer') })
    await assert.rejects(() => attachmentTransaction(outer, async (inner) => {
      afterAttachmentCommit(inner, () => { effects.push('incorrect commit') })
      afterAttachmentRollback(inner, () => { effects.push('discard inner') })
      throw new Error('inner failure')
    }), /inner failure/)
    await attachmentTransaction(outer, async (inner) => {
      afterAttachmentCommit(inner, () => { effects.push('commit retained') })
    })
  })
  assert.deepEqual(effects, ['discard inner'])
  assert.lengthOf(sql.filter((statement) => statement.startsWith('SAVEPOINT ')), 3)
  assert.equal(sql[2], `ROLLBACK TO SAVEPOINT ${sql[1]!.slice('SAVEPOINT '.length)}`)
  assert.isFalse(sql.some((statement) => /COMMIT|RELEASE/.test(statement)))
  await hooks.get('commit')!()
  assert.deepEqual(effects, ['discard inner', 'commit outer', 'commit retained'])
})

test('keeps post-commit failures distinct and attempts every callback', async ({ assert }) => {
  const database = await createLucidTestDatabase()
  const calls: string[] = []
  try {
    await assert.rejects(() => attachmentTransaction(database.connection(), async (trx) => {
      afterAttachmentRollback(trx, () => { calls.push('rollback') })
      afterAttachmentCommit(trx, () => { calls.push('cleanup'); throw new Error('storage unavailable') })
      afterAttachmentCommit(trx, () => { calls.push('queue') })
    }), AttachmentPostCommitError)
    assert.deepEqual(calls, ['cleanup', 'queue'])
  } finally {
    await database.manager.closeAll()
  }
})

test('does not delete files when commit succeeds but its acknowledgement fails', async ({ assert }) => {
  const database = await createLucidTestDatabase()
  const calls: string[] = []
  try {
    await assert.rejects(() => attachmentTransaction(database.connection(), async (trx) => {
      afterAttachmentRollback(trx, () => { calls.push('delete new file') })
      afterAttachmentCommit(trx, () => { calls.push('delete old file') })
      const commit = trx.commit.bind(trx)
      trx.commit = async () => { await commit(); throw new Error('connection lost after commit') }
    }), AttachmentCommitError)
    assert.isEmpty(calls)
  } finally {
    await database.manager.closeAll()
  }
})
