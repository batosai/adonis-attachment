/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'
import { AttachmentConfigurationError } from '../errors.js'

/** Application record and field owning an attachment, independent of an ORM. */
export type AttachmentOwner<Model = unknown> = {
  type: string
  id: string
  field: string
  model?: Model
  /** Optional existing row used by SQL adapters to serialize owner mutations. */
  lock?: { table: string; column: string; value: string | number }
}

/** Persisted file view; adapters may return richer objects such as Lucid models. */
export interface AttachmentRecord {
  readonly id: string
  toAttachment(): Attachment
}

/** Owner entry identity is distinct from the identity of its stored file. */
export interface AttachmentEntry extends AttachmentRecord {
  readonly attachmentId: string
}

export interface AttachmentCollectionPersistence<Entry extends AttachmentEntry, Record extends AttachmentRecord> {
  createCollectionItem(owner: AttachmentOwner, attachment: Attachment, position?: number): Promise<Entry>
  findCollectionItem(owner: AttachmentOwner, id: string): Promise<Entry | null>
  listCollection(owner: AttachmentOwner): Promise<Entry[]>
  moveCollectionItem(owner: AttachmentOwner, id: string, position: number): Promise<Entry[]>
  removeCollectionItem(owner: AttachmentOwner, item: Entry): Promise<Record[]>
}

/** Optional capability: JSON adapters need not support shared file references. */
export interface AttachmentLinkPersistence<Entry extends AttachmentEntry> {
  createOriginalLink(owner: AttachmentOwner, attachmentId: string): Promise<Entry>
  createCollectionLink(owner: AttachmentOwner, attachmentId: string, position?: number): Promise<Entry>
}

export interface AttachmentTransaction<Store> {
  /** True only inside a managed scope, not merely when a connection is supplied. */
  readonly isScoped: boolean
  /** Lock the owner and pass a scoped store; preserve any outer transaction. */
  transaction<T>(owner: AttachmentOwner, callback: (store: Store, owner: AttachmentOwner) => Promise<T>): Promise<T>
  /** Run only after the outermost transaction is confirmed committed. */
  afterCommit(callback: () => void | Promise<void>): void
  /** Run only after rollback is confirmed; never compensate an uncertain commit. */
  afterRollback(callback: () => void | Promise<void>): void
}

/**
 * Lifecycle boundary. Transaction methods are optional only for compatibility with
 * existing custom stores; official adapters must implement the complete capability.
 * Collection and shared-link operations are separately optional capabilities.
 */
export interface AttachmentPersistence<
  Entry extends AttachmentEntry = AttachmentEntry,
  Record extends AttachmentRecord = AttachmentRecord,
> extends Partial<AttachmentCollectionPersistence<Entry, Record>>,
    Partial<AttachmentLinkPersistence<Entry>>,
    Partial<AttachmentTransaction<AttachmentPersistence<Entry, Record>>> {
  createOriginal(owner: AttachmentOwner, attachment: Attachment): Promise<Entry>
  findOriginal(owner: AttachmentOwner): Promise<Entry | null>
  listVariants(originalId: string): Promise<Record[]>
  /** Temporarily release singular ownership during an atomic replacement. */
  releaseOwner(original: Entry): Promise<void>
  restoreOwner(original: Entry): Promise<void>
  /** Return only files actually removed from persistence and safe to clean up. */
  remove(entry: Entry, owner?: AttachmentOwner): Promise<Record[]>
  /** Enumerate all entries of this owner, across its attachment fields. */
  listOwnerLinks(owner: AttachmentOwner): Promise<Entry[]>
}

/** Reject partial transaction implementations instead of silently losing safety. */
export function hasAttachmentTransactions<Entry extends AttachmentEntry, Record extends AttachmentRecord>(
  store: AttachmentPersistence<Entry, Record>
): store is AttachmentPersistence<Entry, Record> & AttachmentTransaction<AttachmentPersistence<Entry, Record>> {
  if (store.transaction === undefined && store.isScoped === undefined &&
      store.afterCommit === undefined && store.afterRollback === undefined) return false

  if (typeof store.transaction !== 'function' || typeof store.isScoped !== 'boolean' ||
      typeof store.afterCommit !== 'function' || typeof store.afterRollback !== 'function') {
    throw new AttachmentConfigurationError('Attachment stores must implement the complete transaction capability')
  }
  return true
}
