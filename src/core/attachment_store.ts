/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'
import type { AttachmentRepository } from './attachment_repository.js'
import type { AttachmentMetadataPersister } from './attachment_metadata_persister.js'
import type { AttachmentPersistence } from './attachment_persistence.js'
import type { AttachmentPersistenceOptions } from './attachment_options.js'
import type { AttachmentService } from './attachment_service.js'
import type { VariantGenerator } from './attachment_job_processor.js'
import type { VariantConverterRegistry } from '../converters/configured_variant_converter_registry.js'
import type { VariantPathOptions } from '../variants/variant_path.js'

/** Shared settings available to store factories when the application boots. */
export type AttachmentStoreContext = {
  defaultDisk: string
  defaults?: AttachmentPersistenceOptions
  variant?: VariantPathOptions
}

/**
 * Data integration, separate from byte storage. Read-only stores need only a
 * repository; write/lifecycle, metadata and variant capabilities are optional.
 * Implement AttachmentPersistence's complete transaction contract when providing
 * transactional lifecycle operations.
 */
export interface AttachmentStore {
  readonly repository: AttachmentRepository
  readonly persistence?: AttachmentPersistence
  readonly metadataPersister?: AttachmentMetadataPersister
  variants?(
    attachments: AttachmentService,
    converters: VariantConverterRegistry,
    context: AttachmentStoreContext,
  ): VariantGenerator | Promise<VariantGenerator>
}

export type AttachmentStoreFactory = (
  app: ApplicationService,
  context: AttachmentStoreContext,
) => AttachmentStore | Promise<AttachmentStore>

export type AttachmentStoreConfig = AttachmentStore | AttachmentStoreFactory | false
