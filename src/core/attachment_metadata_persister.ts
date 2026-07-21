/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'
import type { AttachmentMetadata } from '../media/media_metadata.js'

/** Persists metadata extracted after an attachment has already been stored. */
export interface AttachmentMetadataPersister {
  persistMetadata(attachment: Attachment, metadata: AttachmentMetadata): Promise<void>
}
