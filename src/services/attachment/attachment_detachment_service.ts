/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { RecordWithAttachment as RecordWithAttachmentImplementation } from '../../types/service.js'
import type { Attachment as AttachmentType } from '../../types/attachment.js'
import { AttachmentUtils } from './attachment_utils.js'

export class AttachmentDetachmentService {
  /**
   * Detach dirty attachments (mark for deletion)
   */
  async detach(record: RecordWithAttachmentImplementation): Promise<void> {
    const attachmentAttributeNames = AttachmentUtils.getDirtyAttributeNamesOfAttachment(record.row)

    await Promise.allSettled(
      attachmentAttributeNames.map(async (name) => {
        let attachments: AttachmentType[] = []
        const options = AttachmentUtils.getOptionsByAttributeName(record.row, name)

        if (record.row.$dirty[name] === null) {
          attachments = AttachmentUtils.getOriginalAttachmentsByAttributeName(record.row, name)
        } else {
          const originalAttachments = AttachmentUtils.getOriginalAttachmentsByAttributeName(
            record.row,
            name
          )
          const newAttachments = AttachmentUtils.getAttachmentsByAttributeName(record.row, name)

          /**
           * Clean Attachments changed
           */
          for (const originalAttachment of originalAttachments) {
            if (newAttachments.includes(originalAttachment)) {
              continue
            }

            /**
             * If there was an existing file, then we must get rid of it
             */
            if (originalAttachment) {
              originalAttachment.setOptions(options)
              attachments.push(originalAttachment)
            }
          }
        }

        await this.#moveForDeletion(attachments)
        await this.#markForDeletion(attachments, record)
      })
    )
  }

  /**
   * Detach all attachments (mark all for deletion)
   */
  async detachAll(record: RecordWithAttachmentImplementation): Promise<void> {
    const attachmentAttributeNames = AttachmentUtils.getAttributeNamesOfAttachment(record.row)

    await Promise.allSettled(
      attachmentAttributeNames.map((name) => {
        const options = AttachmentUtils.getOptionsByAttributeName(record.row, name)
        const attachments = AttachmentUtils.getAttachmentsByAttributeName(record.row, name)

        for (const attachment of attachments) {
          attachment.setOptions(options)
        }

        this.#markForDeletion(attachments, record)
      })
    )
  }

  /**
   * Mark attachments for deletion by adding them to detached array
   */
  async #markForDeletion(
    attachments: AttachmentType[],
    record: RecordWithAttachmentImplementation
  ): Promise<void> {
    await Promise.allSettled(
      attachments.map((attachment) => record.row.$attachments.detached.push(attachment))
    )
  }

  async #moveForDeletion(attachments: AttachmentType[]): Promise<void> {
    await Promise.allSettled(attachments.map((attachment) => attachment.moveFileForDelete()))
  }
}
