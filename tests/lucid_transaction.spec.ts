import { test } from '@japa/runner'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'
import {
  attachmentTransaction, afterAttachmentCommit, afterAttachmentRollback,
  AttachmentCommitError, AttachmentPostCommitError,
} from '../src/integrations/lucid/persistence/attachment_transaction.js'

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
