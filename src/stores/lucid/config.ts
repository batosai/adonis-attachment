/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentStoreContext } from '../../core/attachment_store.js'
import type { AttachmentService } from '../../core/attachment_service.js'
import type { AttachmentMetadataPersister } from '../../core/attachment_metadata_persister.js'
import type { AttachmentProcessingAdapters } from '../../core/attachment_processing_adapter.js'
import type { VariantGenerator } from '../../core/attachment_job_processor.js'
import {
  AttachmentRepositoryRegistry,
  type AttachmentRepository,
  type AttachmentReferenceRepository,
} from '../../core/attachment_repository.js'
import type { VariantConverterRegistry } from '../../converters/configured_variant_converter_registry.js'
import { VariantGenerationService } from '../../variants/variant_generation_service.js'
import type { AttachmentModel } from './models/attachment_model.js'
import type { LucidAttachmentStore } from './persistence/lucid_attachment_store.js'
import { LucidAttachmentRepository } from './persistence/lucid_attachment_repository.js'
import { LucidAttachmentMetadataPersister } from './persistence/lucid_attachment_metadata_persister.js'
import { LucidVariantGenerationService } from './persistence/lucid_variant_generation_service.js'
import { configureLucidAttachmentTables } from './schema/configure_lucid_attachment_tables.js'
import { createLegacyAttachmentAdapter, type LegacyAttachmentConfig } from './legacy/config.js'

export type LucidAttachmentStoreConfig = {
  tableName?: string
  legacy?: LegacyAttachmentConfig
}

/** Internal services assembled around a Lucid persistence instance. */
export type LucidStoreServices = {
  processingAdapters: AttachmentProcessingAdapters
  repository: AttachmentRepository & AttachmentReferenceRepository
  metadataPersister: AttachmentMetadataPersister
  variants(
    attachments: AttachmentService,
    converters: VariantConverterRegistry,
    context: AttachmentStoreContext,
  ): VariantGenerator
}

/** Apply application configuration without putting its assembly in the SQL store. */
export function configureLucidStore(
  store: LucidAttachmentStore,
  model: typeof AttachmentModel,
  options: LucidAttachmentStoreConfig,
  context: AttachmentStoreContext,
): LucidStoreServices {
  configureLucidAttachmentTables(options.tableName)
  const adapters: Record<string, AttachmentProcessingAdapters[string]> = {}
  if (options.legacy) {
    const variant = context.variant ?? options.legacy.variant
    const adapter = createLegacyAttachmentAdapter({
      ...options.legacy,
      defaultDisk: context.defaultDisk,
      ...(context.defaults ? { defaults: context.defaults } : {}),
      ...(variant ? { variant } : {}),
    })
    adapters[adapter.name] = adapter
  }
  return createLucidStoreServices(store, model, adapters)
}

/** Also supports the existing direct constructor used by low-level lifecycle code. */
export function createLucidStoreServices(
  store: LucidAttachmentStore,
  model: typeof AttachmentModel,
  adapters: AttachmentProcessingAdapters = {},
): LucidStoreServices {
  const tables = new LucidAttachmentRepository(model)
  const tableMetadata = new LucidAttachmentMetadataPersister(model)
  const hasAdapters = Object.keys(adapters).length > 0

  return {
    processingAdapters: adapters,
    repository: hasAdapters
      ? new AttachmentRepositoryRegistry({
          legacy: tables,
          adapters: {
            tables,
            ...Object.fromEntries(
              Object.entries(adapters).map(([key, adapter]) => [key, adapter.repository]),
            ),
          },
        })
      : tables,
    metadataPersister: hasAdapters
      ? {
          persistMetadata(attachment, metadata) {
            const adapter = attachment.reference
              ? adapters[attachment.reference.adapter]
              : undefined
            return (adapter?.metadataPersister ?? tableMetadata).persistMetadata(
              attachment,
              metadata,
            )
          },
        }
      : tableMetadata,
    variants(attachments, converters, context) {
      const tableVariants = new LucidVariantGenerationService({
        attachments,
        generator: new VariantGenerationService({
          attachments,
          converters,
          ...(context.variant ? { variant: context.variant } : {}),
        }),
        store,
      })
      return {
        generate(request) {
          const adapter = request.attachment.reference
            ? adapters[request.attachment.reference.adapter]
            : undefined
          return (adapter ? adapter.variants(attachments, converters) : tableVariants).generate(
            request,
          )
        },
      }
    },
  }
}
