/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'

import type { Attachment } from '../../../core/attachment.js'
import type { AttachmentMetadata } from '../../../media/media_metadata.js'

/**
 * Default Lucid model for a stored attachment blob.
 * Applications may extend this model to add their own scopes and serialization rules.
 */
export class AttachmentModel extends BaseModel {
  static table = 'attachments'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare parentId: string | null

  @column()
  declare variantKey: string | null

  @column()
  declare disk: string

  @column()
  declare path: string

  @column()
  declare name: string

  @column()
  declare originalName: string

  @column()
  declare mimeType: string

  @column()
  declare extname: string

  @column()
  declare size: number

  @column()
  declare blurhash: string | null

  /** Runtime-only URL populated by relation accessors when enabled. */
  declare url: string | undefined

  @column({
    prepare(value: AttachmentMetadata | null) {
      return value === null ? null : JSON.stringify(value)
    },
    consume(value: unknown) {
      if (value === null || value === undefined || typeof value !== 'string') {
        return value as AttachmentMetadata | null
      }

      return JSON.parse(value) as AttachmentMetadata
    },
  })
  declare metadata: AttachmentMetadata | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  toAttachment(): Attachment {
    return {
      id: this.id,
      disk: this.disk,
      path: this.path,
      name: this.name,
      originalName: this.originalName,
      mimeType: this.mimeType,
      extname: this.extname,
      size: this.size,
      ...(this.blurhash ? { blurhash: this.blurhash } : {}),
      ...(this.metadata ? { metadata: this.metadata } : {}),
      ...(this.url ? { url: this.url } : {}),
    }
  }
}
