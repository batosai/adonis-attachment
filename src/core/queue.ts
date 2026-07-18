export type GenerateVariantsJob = {
  type: 'generate-variants'
  attachmentId: string
  variantKeys?: readonly string[]
}

export type AttachmentJob = GenerateVariantsJob

/**
 * Dispatch boundary. External queues only need to accept an AttachmentJob.
 */
export interface AttachmentQueue {
  enqueue(job: AttachmentJob): Promise<void>
}

export type AttachmentJobHandler = (job: AttachmentJob) => Promise<void>
