/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { RecordWithAttachment as RecordWithAttachmentImplementation } from '../../types/service.js'
import encryption from '@adonisjs/core/services/encryption'
import attachmentManager from '../../../services/main.js'
import { AttachmentUtils } from './attachment_utils.js'

export class AttachmentPersisterService {
  /**
   * Persist attachments before saving the row to the database
   */
  async persistAttachments(record: RecordWithAttachmentImplementation): Promise<void> {
    const attachmentAttributeNames = AttachmentUtils.getDirtyAttributeNamesOfAttachment(record.row)

    await Promise.all(
      attachmentAttributeNames.map(async (name) => {
        const originalAttachments = AttachmentUtils.getOriginalAttachmentsByAttributeName(record.row, name)
        const newAttachments = AttachmentUtils.getAttachmentsByAttributeName(record.row, name)
        const options = AttachmentUtils.getOptionsByAttributeName(record.row, name)

        /**
         * Skip when the attachment attributeName hasn't been updated
         */
        if (!originalAttachments && !newAttachments) {
          return
        }

        /**
         * memorise attribute name for generate variants
         */
        record.row.$attachments.dirtied.push(name)

        for (let i = 0; i < newAttachments.length; i++) {
          if (originalAttachments.includes(newAttachments[i])) {
            continue
          }

          /**
           * If there is a new file and its local then we must save this
           * file.
           */
          if (newAttachments[i]) {
            newAttachments[i].setOptions(options)
            await newAttachments[i].makeFolder(record.row)
            record.row.$attachments.attached.push(newAttachments[i])

            /**
             * Also write the file to the disk right away
             */
            await attachmentManager.write(newAttachments[i])
          }
        }
      })
    )
  }

  /**
   * Pre-compute URLs for all attachments
   */
  async preComputeUrls(record: RecordWithAttachmentImplementation): Promise<void> {
    const attachmentAttributeNames = AttachmentUtils.getAttributeNamesOfAttachment(record.row)

    await Promise.all(
      attachmentAttributeNames.map(async (name) => {
        const options = AttachmentUtils.getOptionsByAttributeName(record.row, name)

        if (record.row.$attributes[name]) {
          const attachments = AttachmentUtils.getAttachmentsByAttributeName(record.row, name)
          for (let i = 0; i < attachments.length; i++) {
            attachments[i].setOptions(options)
            await attachmentManager.preComputeUrl(attachments[i])
          }
        }
      })
    )
  }

  /**
   * Set key IDs for all attachments using encryption
   */
  async setKeyIds(record: RecordWithAttachmentImplementation): Promise<void> {
    const attachmentAttributeNames = AttachmentUtils.getAttributeNamesOfAttachment(record.row)

    await Promise.all(
      attachmentAttributeNames.map(async (name) => {
        if (record.row.$attributes[name]) {
          const attachments = AttachmentUtils.getAttachmentsByAttributeName(record.row, name)
          for (let i = 0; i < attachments.length; i++) {
            const { disk, folder, meta, rename } = attachments[i].options
            const model = record.row.constructor as LucidModel
            const key = encryption.encrypt({
              model: model.table,
              id: record.row.$attributes['id'],
              attribute: name,
              index: i,
              options: {
                disk,
                folder,
                meta,
                rename
              }
            })
            attachments[i].setKeyId(key)
          }
        }
      })
    )
  }
}
