/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'

export type StorageLocation = Pick<Attachment, 'disk' | 'path'>

/** Options forwarded unchanged to a storage provider when creating a signed URL. */
export type AttachmentSignedUrlOptions = Record<string, unknown>

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
  /** Returns a public URL when the storage backend has one. */
  getUrl?(location: StorageLocation): Promise<string | undefined>
  /** Returns an expiring URL when the storage backend supports signed URLs. */
  getSignedUrl?(
    location: StorageLocation,
    options?: AttachmentSignedUrlOptions
  ): Promise<string | undefined>
}
