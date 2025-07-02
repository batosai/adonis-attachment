/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'
import type { RowWithAttachment } from './mixin.js'

export interface RecordWithAttachment {
  row: RowWithAttachment
  commit(): Promise<void>
  rollback(): Promise<void>
  persist(): Promise<void>
  transaction(options?: { enabledRollback: boolean }): Promise<void>
  preComputeUrl(): Promise<void>
  generateVariants(): Promise<void>
  getAttachments(options: { attributeName: string, requiredOriginal?: boolean, requiredDirty?: boolean }): Attachment[]
}
