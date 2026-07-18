import { createHash } from 'node:crypto'

export type AttachmentOwner = {
  type: string
  id: string
  field: string
}

/**
 * Produces the database key that enforces one original attachment per owner field.
 * A digest keeps the indexed column bounded for arbitrary polymorphic identifiers.
 */
export function createAttachmentOwnerKey(owner: AttachmentOwner): string {
  return createHash('sha256').update(JSON.stringify([owner.type, owner.id, owner.field])).digest('hex')
}
