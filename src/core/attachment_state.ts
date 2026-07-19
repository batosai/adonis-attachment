/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'

const pendingAttachments = new WeakSet<Attachment>()

export function markAttachmentPending(attachment: Attachment): void {
  pendingAttachments.add(attachment)
}

export function markAttachmentPersisted(attachment: Attachment): void {
  pendingAttachments.delete(attachment)
}

export function isAttachmentPending(attachment: Attachment): boolean {
  return pendingAttachments.has(attachment)
}
