/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidRow } from '@adonisjs/lucid/types/model'
import type { Attachment } from './attachment.js'

export type AttributeOfModelWithAttachment = {
  attached: Attachment[]
  detached: Attachment[]
  dirtied: string[]
}

export type ModelWithAttachment = LucidRow & {
  $attachments: AttributeOfModelWithAttachment
}
