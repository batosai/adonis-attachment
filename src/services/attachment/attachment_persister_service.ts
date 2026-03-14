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
        const originalAttachments = AttachmentUtils.getOriginalAttachmentsByAttributeName(
          record.row,
          name
        )
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

        for (const newAttachment of newAttachments) {
          if (originalAttachments.includes(newAttachment)) {
            continue
          }

          /**
           * If there is a new file and its local then we must save this
           * file.
           */
          if (newAttachment) {
            newAttachment.setOptions(options)
            await newAttachment.makeFolder(record.row)
            await newAttachment.makeName(record.row, name, newAttachment.originalName)
            record.row.$attachments.attached.push(newAttachment)

            /**
             * Also write the file to the disk right away
             */
            await attachmentManager.write(newAttachment)
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
          for (const attachment of attachments) {
            attachment.setOptions(options)
            await attachmentManager.preComputeUrl(attachment)
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
          for (const [i, attachment] of attachments.entries()) {
            const { disk, folder, meta, rename } = attachment.options
            const model = record.row.constructor as LucidModel
            const key = encryption.encrypt({
              model: model.namingStrategy.tableName(model),
              id: record.row.$primaryKeyValue?.toString() || record.row.$attributes['id'],
              primaryKey: (record.row.constructor as LucidModel).primaryKey ?? 'id',
              attribute: model.namingStrategy.columnName(model, name),
              index: i,
              options: {
                disk,
                folder,
                meta,
                rename,
              },
            })
            attachment.setKeyId(key)
          }
        }
      })
    )
  }
}
