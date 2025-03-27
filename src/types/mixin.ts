/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidRow } from '@adonisjs/lucid/types/model'
import type { Attachment } from './attachment.js'

export type AttributeOfRowWithAttachment = {
  attached: Attachment[]
  detached: Attachment[]
  dirtied: string[]
}

export type RowWithAttachment = LucidRow & {
  $attachments: AttributeOfRowWithAttachment
}
