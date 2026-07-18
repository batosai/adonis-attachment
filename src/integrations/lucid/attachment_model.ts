import { BaseModel, column } from '@adonisjs/lucid/orm'

import type { Attachment } from '../../core/attachment.js'

/**
 * Default Lucid model for the polymorphic attachments table.
 * Applications may extend this model to add their own scopes and serialization rules.
 */
export class AttachmentModel extends BaseModel {
  static table = 'attachments'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare attachableType: string

  @column()
  declare attachableId: string

  @column()
  declare field: string

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
  declare metadata: Record<string, unknown> | null

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
      ...(this.metadata ? { metadata: this.metadata } : {}),
    }
  }
}
