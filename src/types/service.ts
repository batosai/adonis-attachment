import type { Attachment } from './attachment.js'
import type { ModelWithAttachment } from './mixin.js'

export interface Record {
  model: ModelWithAttachment
  commit(): Promise<void>
  rollback(): Promise<void>
  persist(): Promise<void>
  transaction(options?: { enabledRollback: boolean }): Promise<void>
  preComputeUrl(): Promise<void>
  generateVariants(): Promise<void>
  getAttachments(options: { attributeName: string; requiredOriginal?: boolean }): Attachment[]
}
