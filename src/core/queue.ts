/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'
import type { AttachmentEventContext } from '../events/attachment_events.js'

export type GenerateVariantsJob = {
  type: 'generate-variants'
  attachmentId: string
  variantKeys?: readonly string[]
  meta?: boolean
  eventContext?: AttachmentEventContext
}

export type ExtractMetadataJob = {
  type: 'extract-metadata'
  attachmentId: string
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
