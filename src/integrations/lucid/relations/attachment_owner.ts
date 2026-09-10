/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { createHash } from 'node:crypto'
import type { AttachmentOwner } from '../../../core/attachment_persistence.js'

export type { AttachmentOwner } from '../../../core/attachment_persistence.js'

/**
 * Produces the database key that enforces one original attachment per owner field.
 * A digest keeps the indexed column bounded for arbitrary polymorphic identifiers.
 */
export function createAttachmentOwnerKey(owner: AttachmentOwner): string {
  return createHash('sha256').update(JSON.stringify([owner.type, owner.id, owner.field])).digest('hex')
}
