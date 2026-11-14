/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment as AttachmentType } from '../../types/attachment.js'
import type { RecordWithAttachment as RecordWithAttachmentImplementation } from '../../types/service.js'
import attachmentManager from '../../../services/main.js'

export interface TransactionOptions {
  enabledRollback?: boolean
}

type Operation = { attached: AttachmentType[]; detached: AttachmentType[]; rollback: boolean }
const registered = new WeakSet<object>()
const transactions = new WeakMap<object, Operation[]>()

export class AttachmentTransactionService {
  /**
   * During commit, we should cleanup the old detached files
   */
  async commit(detachedAttachments: AttachmentType[]): Promise<void> {
    await Promise.allSettled(
      detachedAttachments.map((attachment: AttachmentType) => attachmentManager.remove(attachment))
    )
  }

  /**
   * During rollback we should remove the attached files.
   */
  async rollback(
    attachedAttachments: AttachmentType[],
    detachedAttachments: AttachmentType[] = []
  ): Promise<void> {
    await Promise.allSettled(
      attachedAttachments.map((attachment) => attachmentManager.remove(attachment))
    )
    await Promise.allSettled(
      detachedAttachments.map((attachment) => attachment.rollbackMoveFileForDelete())
    )
  }

  /**
   * Handle transaction lifecycle with commit and rollback hooks
   */
  async handleTransaction(
    record: RecordWithAttachmentImplementation,
    options: TransactionOptions = { enabledRollback: true }
  ): Promise<void> {
    const { attached, detached } = record.row.$attachments
    try {
      if (record.row.$trx) {
        if (registered.has(record.row.$attachments)) return
        registered.add(record.row.$attachments)
        const trx = record.row.$trx
        let operations = transactions.get(trx)
        if (!operations) {
          operations = []
          transactions.set(trx, operations)
          const journal = operations
          trx.after('commit', async () => {
            try {
              for (const operation of journal) await this.commit(operation.detached)
            } finally {
              transactions.delete(trx)
            }
          })
          trx.after('rollback', async () => {
            try {
              for (const operation of [...journal].reverse()) {
                if (operation.rollback) await this.rollback(operation.attached, operation.detached)
              }
            } finally {
              transactions.delete(trx)
            }
          })
        }
        operations.push({
          attached,
          detached,
          rollback: options.enabledRollback !== false,
        })
      } else {
        await this.commit(detached)
      }
    } catch (error: unknown) {
      if (options.enabledRollback) {
        await this.rollback(attached, detached)
      }
      throw error
    }
  }
}
