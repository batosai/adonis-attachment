/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { createHash } from 'node:crypto'

export type AttachmentOwner<Model = unknown> = {
  type: string
  id: string
  field: string
  model?: Model
  /** Existing row to lock when using the store without a Lucid owner model. */
  lock?: { table: string; column: string; value: string | number }
}

/**
 * Produces the database key that enforces one original attachment per owner field.
 * A digest keeps the indexed column bounded for arbitrary polymorphic identifiers.
 */
export function createAttachmentOwnerKey(owner: AttachmentOwner): string {
  return createHash('sha256').update(JSON.stringify([owner.type, owner.id, owner.field])).digest('hex')
}
