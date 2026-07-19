/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'

export type StorageLocation = Pick<Attachment, 'disk' | 'path'>

export type WriteAttachmentInput = StorageLocation & {
  body: Uint8Array
  mimeType: string
}

/**
 * Storage boundary implemented by Adonis Drive or any application-specific backend.
 */
export interface AttachmentStorage {
  /** Disk selected when an attachment source does not override it. */
  defaultDisk?: string | undefined
  write(input: WriteAttachmentInput): Promise<void>
  read(location: StorageLocation): Promise<Uint8Array>
  remove(location: StorageLocation): Promise<void>
}
