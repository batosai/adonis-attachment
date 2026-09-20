/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'

import { AttachmentJobProcessor } from '../../core/attachment_job_processor.js'
import { AttachmentRepositoryRegistry, type AttachmentRepository } from '../../core/attachment_repository.js'
import type { AttachmentProcessingAdapters } from '../../core/attachment_processing_adapter.js'
import type { AttachmentEventEmitter } from '../../events/attachment_events.js'
import type { VariantConverterRegistry } from '../../converters/configured_variant_converter_registry.js'
import { VariantGenerationService } from '../../variants/variant_generation_service.js'
import type { VariantPathOptions } from '../../variants/variant_path.js'
import { LucidAttachmentRepository } from './persistence/lucid_attachment_repository.js'
import { LucidAttachmentStore } from './persistence/lucid_attachment_store.js'
import { LucidVariantGenerationService } from './persistence/lucid_variant_generation_service.js'

export type CreateLucidAttachmentProcessorOptions = {
  repository?: AttachmentRepository
  converters?: VariantConverterRegistry
  events?: AttachmentEventEmitter
  adapters?: AttachmentProcessingAdapters
  variant?: VariantPathOptions
}

/** Creates the standard Lucid processor used by memory and external queue workers. */
export function createLucidAttachmentProcessor(
  app: ApplicationService,
  options: CreateLucidAttachmentProcessorOptions = {}
): AttachmentJobProcessor {
  const adapters = (): Promise<AttachmentProcessingAdapters> => options.adapters
    ? Promise.resolve(options.adapters)
    : app.container.hasBinding?.('jrmc.attachment.processingAdapters')
      ? app.container.make('jrmc.attachment.processingAdapters')
      : Promise.resolve({})
  const tables = new LucidAttachmentRepository()
  const repository = options.repository ?? {
    findById: tables.findById.bind(tables),
    async findByReference(reference) {
      const registered = await adapters()
      return new AttachmentRepositoryRegistry({ legacy: tables, adapters: {
        tables, ...Object.fromEntries(Object.entries(registered).map(([key, adapter]) => [key, adapter.repository])),
      } }).findByReference(reference)
    },
  } satisfies AttachmentRepository
  const converters = options.converters ?? createContainerConverterRegistry(app)

  return new AttachmentJobProcessor({
    attachments: repository,
    async variants() {
      const attachments = await app.container.make('jrmc.attachment')
      const variant = options.variant ?? (app.container.hasBinding?.('jrmc.attachment.variant')
        ? await app.container.make('jrmc.attachment.variant')
        : undefined)
      const tableVariants = new LucidVariantGenerationService({
        attachments,
        generator: new VariantGenerationService({ attachments, converters, ...(variant ? { variant } : {}) }),
        store: new LucidAttachmentStore(),
      })
      return {
        async generate(request) {
          const key = request.attachment.reference?.adapter
          const adapter = key ? (await adapters())[key] : undefined
          return adapter
            ? adapter.variants(attachments, converters).generate(request)
            : tableVariants.generate(request)
        },
      }
    },
    metadata: {
      async extractAndPersistMetadata(attachment) {
        const attachments = await app.container.make('jrmc.attachment')
        await attachments.extractAndPersistMetadata(attachment)
      },
    },
    ...(options.events ? { events: options.events } : {}),
  })
}

function createContainerConverterRegistry(app: ApplicationService): VariantConverterRegistry {
  return {
    async keys() {
      const converters = await app.container.make('jrmc.attachment.converters')
      return converters.keys()
    },
    async get(key) {
      const converters = await app.container.make('jrmc.attachment.converters')
      return converters.get(key)
    },
  }
}
