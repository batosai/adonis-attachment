/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'
import type { AttachmentEventContext } from '../events/attachment_events.js'
import type { AttachmentReference } from './attachment_reference.js'
import type { AttachmentAdapterConfig, AttachmentAdapterFactory } from './attachment_adapter.js'
import type { AttachmentStoreContext } from './attachment_store.js'

export type AttachmentQueueContext = AttachmentStoreContext & {
  /** Ready-to-use store processor or configured jobHandler for in-process adapters. */
  handler?: AttachmentJobHandler
}

export type AttachmentQueueFactory = AttachmentAdapterFactory<AttachmentQueue, AttachmentQueueContext>
export type AttachmentQueueAdapterConfig = AttachmentAdapterConfig<AttachmentQueue, AttachmentQueueContext>

export type VariantGenerationMode = 'create' | 'replace'

export type GenerateVariantsJob = {
  type: 'generate-variants'
  attachmentId: string
  reference?: AttachmentReference
  variantKeys?: readonly string[]
  meta?: boolean
  /** Replaces existing variants with the same key instead of creating new rows. */
  mode?: VariantGenerationMode
  eventContext?: AttachmentEventContext
}

export type ExtractMetadataJob = {
  type: 'extract-metadata'
  attachmentId: string
  reference?: AttachmentReference
  attachment: Attachment
  eventContext?: AttachmentEventContext
}

export type AttachmentJob = GenerateVariantsJob | ExtractMetadataJob

/**
 * Dispatch boundary. External queues only need to accept an AttachmentJob.
 */
export interface AttachmentQueue {
  enqueue(job: AttachmentJob): Promise<void>
}

export type AttachmentJobHandler = (job: AttachmentJob) => Promise<void>
