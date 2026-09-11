/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'
import { parseAttachmentReference, validateAttachmentReference, withAttachmentReference, type AttachmentReference } from './attachment_reference.js'
import { AttachmentConfigurationError, AttachmentValidationError } from '../errors.js'

/**
 * Read boundary used by asynchronous workers. Lucid, another ORM, or no database
 * can implement it according to the application's persistence model.
 */
export interface AttachmentRepository {
  findById(id: string): Promise<Attachment | null>
  /** Explicit references must never silently fall back to a bare-ID lookup. */
  findByReference?(reference: AttachmentReference): Promise<Attachment | null>
}

export interface AttachmentReferenceRepository {
  /** Resolve the exact owner and identity; return null if removed or replaced. */
  findByReference(reference: AttachmentReference): Promise<Attachment | null>
}

/** Route locators only to application-registered adapters, never to arbitrary SQL. */
export class AttachmentRepositoryRegistry implements AttachmentRepository {
  readonly #legacy: AttachmentRepository
  readonly #adapters: ReadonlyMap<string, AttachmentReferenceRepository>

  constructor(options: { legacy: AttachmentRepository; adapters: Record<string, AttachmentReferenceRepository> }) {
    this.#legacy = options.legacy
    this.#adapters = new Map(Object.entries(options.adapters))
  }

  findById(id: string): Promise<Attachment | null> {
    return this.#legacy.findById(id)
  }

  async findByReference(value: AttachmentReference): Promise<Attachment | null> {
    const reference = parseAttachmentReference(value)
    const adapter = this.#adapters.get(reference.adapter)
    if (!adapter) throw new AttachmentConfigurationError(`Attachment reference adapter "${reference.adapter}" is not registered`)
    return resolveReferencedAttachment(adapter, reference)
  }
}

export async function resolveAttachment(
  repository: AttachmentRepository,
  id: string,
  value?: AttachmentReference
): Promise<Attachment | null> {
  if (value === undefined) return repository.findById(id)
  const reference = validateAttachmentReference(id, value)
  if (!repository.findByReference) {
    throw new AttachmentConfigurationError('Attachment references require a reference-capable repository')
  }
  return resolveReferencedAttachment({ findByReference: repository.findByReference.bind(repository) }, reference)
}

async function resolveReferencedAttachment(repository: AttachmentReferenceRepository, reference: AttachmentReference): Promise<Attachment | null> {
  const attachment = await repository.findByReference(reference)
  if (!attachment) return null
  if (attachment.id !== reference.id) throw new AttachmentValidationError('Attachment repository returned a different attachment ID')
  return withAttachmentReference(attachment, reference)
}
