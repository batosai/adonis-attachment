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

export class AttachmentTransactionService {
  /**
   * During commit, we should cleanup the old detached files
   */
  async commit(detachedAttachments: AttachmentType[]): Promise<void> {
    await Promise.allSettled(
      detachedAttachments.map((attachment: AttachmentType) =>
        attachmentManager.remove(attachment)
      )
    )
  }

  /**
   * During rollback we should remove the attached files.
   */
  async rollback(attachedAttachments: AttachmentType[]): Promise<void> {
    await Promise.allSettled(
      attachedAttachments.map(async (attachment: AttachmentType) => {
        await attachment.rollbackMoveFileForDelete()
        await attachmentManager.remove(attachment)
      })
    )
  }

  /**
   * Handle transaction lifecycle with commit and rollback hooks
   */
  async handleTransaction(
    record: RecordWithAttachmentImplementation,
    options: TransactionOptions = { enabledRollback: true }
  ): Promise<void> {
    try {
      if (record.row.$trx) {
        record.row.$trx.after('commit', () => this.commit(record.row.$attachments.detached))
        if (options.enabledRollback) {
          record.row.$trx.after('rollback', () => this.rollback(record.row.$attachments.attached))
        }
      } else {
        await this.commit(record.row.$attachments.detached)
      }
    } catch (error: unknown) {
      if (options.enabledRollback) {
        await this.rollback(record.row.$attachments.attached)
      }
      throw error
    }
  }
}
