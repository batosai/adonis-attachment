/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'
import { AttachmentValidationError } from '../errors.js'

/** Serializable locator, not an authorization token or a physical SQL address. */
export type AttachmentReference = Readonly<{
  version: 1
  adapter: string
  id: string
  owner?: Readonly<{ type: string; id: string; field: string }>
}>

/** Validate queue input and copy only the supported, versioned locator fields. */
export function parseAttachmentReference(value: unknown): AttachmentReference {
  if (!isObject(value) || value.version !== 1 ||
      typeof value.adapter !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value.adapter) ||
      !isIdentifier(value.id) || !hasOnly(value, ['version', 'adapter', 'id', 'owner'])) {
    throw new AttachmentValidationError('Invalid attachment reference')
  }
  let owner: AttachmentReference['owner']
  if (value.owner !== undefined) {
    if (!isObject(value.owner) || !hasOnly(value.owner, ['type', 'id', 'field']) ||
        !isIdentifier(value.owner.type) || !isIdentifier(value.owner.id) || !isIdentifier(value.owner.field)) {
      throw new AttachmentValidationError('Invalid attachment reference owner')
    }
    owner = { type: value.owner.type, id: value.owner.id, field: value.owner.field }
  }
  return { version: 1, adapter: value.adapter, id: value.id, ...(owner ? { owner } : {}) }
}

/** Reject contradictory IDs instead of addressing an unrelated persisted file. */
export function validateAttachmentReference(id: string, value: unknown): AttachmentReference {
  const reference = parseAttachmentReference(value)
  if (reference.id !== id) throw new AttachmentValidationError('Attachment reference does not match its attachment ID')
  return reference
}

export function withAttachmentReference(attachment: Attachment, reference: AttachmentReference): Attachment {
  return { ...attachment, reference: validateAttachmentReference(attachment.id, reference) }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024
}

function hasOnly(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}
