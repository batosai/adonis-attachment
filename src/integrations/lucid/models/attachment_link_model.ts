/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'

import type { Attachment } from '../../../core/attachment.js'
import { AttachmentModel } from './attachment_model.js'
import { AttachmentConfigurationError } from '../../../errors.js'

/**
 * Polymorphic relation between an application record and an attachment blob.
 */
export class AttachmentLinkModel extends BaseModel {
  static table = 'adonis_attachment_links'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare attachableType: string

  @column()
  declare attachableId: string

  @column()
  declare field: string

  @column({ serializeAs: null })
  declare ownerKey: string | null

  @column()
  declare position: number | null

  @column()
  declare attachmentId: string

  @belongsTo(() => AttachmentModel, { foreignKey: 'attachmentId' })
  declare attachment: BelongsTo<typeof AttachmentModel>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  toAttachment(): Attachment {
    if (!this.attachment) {
      throw new AttachmentConfigurationError(
        'Attachment links must load their attachment blob before they can be read'
      )
    }

    return this.attachment.toAttachment()
  }
}
