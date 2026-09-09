import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'

type Callback = () => void | Promise<void>
type Effects = { commit: Callback[]; rollback: Callback[] }
const effects = new WeakMap<TransactionClientContract, Effects>()

/** A commit error does not prove rollback; retain files until the database is reconciled. */
export class AttachmentCommitError extends Error {
  readonly outcome = 'unknown'

  constructor(cause: unknown) {
    super('Attachment commit outcome is unknown; reload database state before retrying or deleting files', { cause })
    this.name = 'AttachmentCommitError'
  }
}

/** SQL is committed; callers must not compensate by deleting the new attachment. */
export class AttachmentPostCommitError extends AggregateError {
  readonly committed = true

  constructor(errors: unknown[]) {
    super(errors, 'Attachment transaction committed, but post-commit work failed')
    this.name = 'AttachmentPostCommitError'
  }
}

export function afterAttachmentCommit(client: TransactionClientContract, callback: Callback): void {
  const pending = effects.get(client)
  if (pending) pending.commit.push(callback)
  else client.after('commit', callback)
}

export function afterAttachmentRollback(client: TransactionClientContract, callback: Callback): void {
  const pending = effects.get(client)
  if (pending) pending.rollback.push(callback)
  else client.after('rollback', callback)
}

/** Savepoints keep caught failures atomic; file effects follow the outermost commit. */
export async function attachmentTransaction<T>(
  client: QueryClientContract,
  callback: (transaction: TransactionClientContract) => Promise<T>
): Promise<T> {
  const transaction = await client.transaction()
  const pending: Effects = { commit: [], rollback: [] }
  effects.set(transaction, pending)
  let result: T
  try {
    result = await callback(transaction)
  } catch (error) {
    const errors: unknown[] = [error]
    try { await transaction.rollback() } catch (rollbackError) { errors.push(rollbackError) }
    effects.delete(transaction)
    if (errors.length === 1) errors.push(...await runCallbacks([...pending.rollback].reverse()))
    if (errors.length > 1) throw new AggregateError(errors, 'Attachment transaction and rollback cleanup failed')
    throw error
  }

  try {
    await transaction.commit()
  } catch (error) {
    // A connection can fail after the server committed. Compensating files is unsafe.
    await transaction.rollback().catch(() => undefined)
    throw new AttachmentCommitError(error)
  } finally {
    effects.delete(transaction)
  }

  if (client.isTransaction) {
    const parent = client as TransactionClientContract
    const parentEffects = effects.get(parent)
    if (parentEffects) {
      parentEffects.commit.push(...pending.commit)
      parentEffects.rollback.push(...pending.rollback)
    } else {
      parent.after('commit', async () => {
        const errors = await runCallbacks(pending.commit)
        if (errors.length) throw new AttachmentPostCommitError(errors)
      })
      parent.after('rollback', async () => {
        const errors = await runCallbacks([...pending.rollback].reverse())
        if (errors.length) throw new AggregateError(errors, 'Attachment rollback cleanup failed')
      })
    }
  } else {
    const errors = await runCallbacks(pending.commit)
    if (errors.length) throw new AttachmentPostCommitError(errors)
  }
  return result
}

async function runCallbacks(callbacks: Callback[]): Promise<unknown[]> {
  const errors: unknown[] = []
  for (const callback of callbacks) {
    try { await callback() } catch (error) { errors.push(error) }
  }
  return errors
}
