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
      attachmentAttributeNames.map((name) => {
        let attachments: AttachmentType[] = []
        const options = AttachmentUtils.getOptionsByAttributeName(record.row, name)

        if (record.row.$dirty[name] === null) {
          attachments = AttachmentUtils.getOriginalAttachmentsByAttributeName(record.row, name)
        } else {
          const originalAttachments = AttachmentUtils.getOriginalAttachmentsByAttributeName(record.row, name)
          const newAttachments = AttachmentUtils.getAttachmentsByAttributeName(record.row, name)

          /**
           * Clean Attachments changed
           */
          for (let i = 0; i < originalAttachments.length; i++) {
            if (newAttachments.includes(originalAttachments[i])) {
              continue
            }

            /**
             * If there was an existing file, then we must get rid of it
             */
            if (originalAttachments[i]) {
              originalAttachments[i].setOptions(options)
              attachments.push(originalAttachments[i])
            }
          }
        }

        this.#markForDeletion(attachments, record)
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

        for (let i = 0; i < attachments.length; i++) {
          attachments[i].setOptions(options)
        }

        this.#markForDeletion(attachments, record)
      })
    )
  }

  /**
   * Mark attachments for deletion by adding them to detached array
   */
  #markForDeletion(attachments: AttachmentType[], record: RecordWithAttachmentImplementation): void {
    for (let i = 0; i < attachments.length; i++) {
      record.row.$attachments.detached.push(attachments[i])
    }
  }
}
