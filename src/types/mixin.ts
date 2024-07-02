/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidRow } from '@adonisjs/lucid/types/model'
import type { Attachment } from './attachment.js'

export type ModelWithAttachmentAttribute = {
  attached: Attachment[]
  detached: Attachment[]
  propertiesModified: string[]
}

export type ModelWithAttachment = LucidRow & {
  $attachments: ModelWithAttachmentAttribute
}