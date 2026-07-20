/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

export {
  AttachmentFactory,
  AttachmentDraft,
  isAttachmentDraft,
  type Attachment,
  type AttachmentDraftPersistence,
  type AttachmentFactoryOptions,
  type AttachmentPersistRequest,
  type CreateAttachmentInput,
} from './attachment.js'
export {
  resolveAttachmentPersistenceOptions,
  type AttachmentFolder,
  type AttachmentPersistenceContext,
  type AttachmentPersistenceOptions,
  type AttachmentRename,
  type ResolvedAttachmentPersistenceOptions,
} from './attachment_options.js'
export { AttachmentService, type AttachmentServiceOptions } from './attachment_service.js'
export {
  AttachmentJobProcessor,
  AttachmentNotFoundError,
  type AttachmentJobProcessorOptions,
  type VariantGenerationRequest,
  type VariantGenerator,
  type VariantGeneratorFactory,
} from './attachment_job_processor.js'
export { type AttachmentRepository } from './attachment_repository.js'
export {
  type AttachmentJob,
  type AttachmentJobHandler,
  type AttachmentQueue,
  type GenerateVariantsJob,
} from './queue.js'
export {
  type AttachmentStorage,
  type StorageLocation,
  type WriteAttachmentInput,
} from './storage.js'
