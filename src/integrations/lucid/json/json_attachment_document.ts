/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { createHash } from 'node:crypto'
import type { Attachment } from '../../../core/attachment.js'
import type { AttachmentOwner, AttachmentEntry, AttachmentRecord } from '../../../core/attachment_persistence.js'
import { withAttachmentReference } from '../../../core/attachment_reference.js'
import { AttachmentValidationError } from '../../../errors.js'

export type JsonAttachmentOwner = Pick<AttachmentOwner, 'type' | 'id' | 'field'>
export type JsonAttachmentDocument = Record<string, unknown> & { id: string; variants?: JsonAttachmentDocument[] }

/** A detached read view, not a Lucid model. Mutation goes through the scoped store. */
export class JsonAttachmentRecord implements AttachmentRecord {
  /** Runtime-only URL, never written to the JSON document. */
  url?: string
  constructor(
    readonly id: string,
    readonly owner: JsonAttachmentOwner,
    private readonly attachment: Attachment,
    readonly parentId: string | null = null,
    readonly variantKey: string | null = null,
  ) {}

  toAttachment(): Attachment {
    return withAttachmentReference({ ...structuredClone(this.attachment), ...(this.url ? { url: this.url } : {}) }, {
      version: 1, adapter: 'json', id: this.id, owner: { ...this.owner },
    })
  }
}

export class JsonAttachmentEntry extends JsonAttachmentRecord implements AttachmentEntry {
  get attachmentId(): string { return this.id }
  constructor(id: string, owner: JsonAttachmentOwner, attachment: Attachment, readonly position: number | null) {
    super(id, owner, attachment)
  }
}

/** Read v5 objects without rewriting them. IDs are persisted only on an explicit write. */
export function decodeJsonAttachments(
  value: unknown, kind: 'one' | 'many', owner: JsonAttachmentOwner, defaultDisk: string,
): JsonAttachmentDocument[] {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { throw invalid('Invalid attachment JSON') }
  }
  if (value === null || value === undefined) return []
  if (kind === 'many' ? !Array.isArray(value) : !isObject(value)) throw invalid(`Expected a ${kind === 'many' ? 'JSON array' : 'JSON object'} attachment column`)
  const documents = (kind === 'many' ? value as unknown[] : [value]).map((item) => normalize(item, owner, defaultDisk))
  validateJsonAttachments(documents, defaultDisk)
  return documents
}

function normalize(value: unknown, owner: JsonAttachmentOwner, defaultDisk: string, parent?: JsonAttachmentDocument): JsonAttachmentDocument {
  if (!isObject(value)) throw invalid('Invalid JSON attachment document')
  const data = structuredClone(value)
  const key = parent ? requiredString(data.key, 'variant key') : undefined
  const file = attachmentFromDocument({ ...data, id: 'pending' }, defaultDisk, parent ? String(parent.originalName ?? parent.name) : undefined)
  const id = data.id === undefined
    ? `legacy_${createHash('sha256').update(JSON.stringify([owner.type, owner.id, owner.field, parent?.id, key, file.disk, file.path])).digest('hex')}`
    : requiredString(data.id, 'id')
  const result: JsonAttachmentDocument = { ...data, id }
  if (id.length > 1024) throw invalid('Attachment ID is too long')
  if (parent && data.variants !== undefined) throw invalid('Nested variants are not supported')
  if (data.variants !== undefined) {
    if (!Array.isArray(data.variants)) throw invalid('Attachment variants must be an array')
    result.variants = data.variants.map((variant) => normalize(variant, owner, defaultDisk, result))
  }
  return result
}

export function attachmentFromDocument(document: JsonAttachmentDocument, defaultDisk: string, originalName?: string): Attachment {
  const name = requiredString(document.name, 'name')
  if (typeof document.size !== 'number' || !Number.isSafeInteger(document.size) || document.size < 0) throw invalid('Attachment size must be a non-negative safe integer')
  if (typeof document.extname !== 'string') throw invalid('Invalid attachment extension')
  if (document.meta !== undefined && !isObject(document.meta)) throw invalid('Attachment meta must be an object')
  if (document.blurhash !== undefined && typeof document.blurhash !== 'string') throw invalid('Invalid attachment blurhash')
  return {
    id: document.id, name, size: document.size, extname: document.extname,
    disk: requiredString(document.disk ?? defaultDisk, 'disk'),
    path: requiredString(document.path ?? name, 'path'),
    originalName: requiredString(document.originalName ?? originalName ?? name, 'originalName'),
    mimeType: requiredString(document.mimeType, 'mimeType'),
    ...(document.meta !== undefined ? { metadata: structuredClone(document.meta) as Record<string, unknown> } : {}),
    ...(typeof document.blurhash === 'string' ? { blurhash: document.blurhash } : {}),
  }
}

export function documentFromAttachment(attachment: Attachment): JsonAttachmentDocument {
  if (attachment.reference !== undefined) throw invalid('JSON attachments cannot share an already referenced file')
  const document: JsonAttachmentDocument = {
    id: attachment.id, disk: attachment.disk, path: attachment.path, name: attachment.name,
    originalName: attachment.originalName, size: attachment.size, mimeType: attachment.mimeType,
    extname: attachment.extname,
    ...(attachment.metadata !== undefined ? { meta: structuredClone(attachment.metadata) } : {}),
    ...(attachment.blurhash !== undefined ? { blurhash: attachment.blurhash } : {}),
  }
  requiredString(document.id, 'id')
  if (document.id.length > 1024) throw invalid('Attachment ID is too long')
  attachmentFromDocument(document, attachment.disk)
  return document
}

export function validateJsonAttachments(documents: JsonAttachmentDocument[], defaultDisk: string): void {
  const ids = new Set<string>()
  const locations = new Set<string>()
  for (const original of documents) {
    const keys = new Set<string>()
    for (const document of [original, ...(original.variants ?? [])]) {
      const attachment = attachmentFromDocument(document, defaultDisk)
      const location = JSON.stringify([attachment.disk, attachment.path])
      if (ids.has(document.id) || locations.has(location)) throw invalid('JSON attachments must have distinct IDs and file locations')
      ids.add(document.id); locations.add(location)
      if (document !== original) {
        const key = requiredString(document.key, 'variant key')
        if (keys.has(key)) throw invalid('Duplicate JSON variant key')
        keys.add(key)
      }
    }
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.length) throw invalid(`Invalid attachment ${field}`)
  return value
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function invalid(message: string): AttachmentValidationError { return new AttachmentValidationError(message) }
