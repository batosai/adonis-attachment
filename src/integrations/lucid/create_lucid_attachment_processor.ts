/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'

import { AttachmentJobProcessor } from '../../core/attachment_job_processor.js'
import type { AttachmentRepository } from '../../core/attachment_repository.js'
import type { AttachmentEventEmitter } from '../../events/attachment_events.js'
import type { VariantConverterRegistry } from '../../converters/configured_variant_converter_registry.js'
import { VariantGenerationService } from '../../variants/variant_generation_service.js'
import { LucidAttachmentRepository } from './persistence/lucid_attachment_repository.js'
import { LucidAttachmentStore } from './persistence/lucid_attachment_store.js'
import { LucidVariantGenerationService } from './persistence/lucid_variant_generation_service.js'

export type CreateLucidAttachmentProcessorOptions = {
  repository?: AttachmentRepository
  converters?: VariantConverterRegistry
  events?: AttachmentEventEmitter
}

/** Creates the standard Lucid processor used by memory and external queue workers. */
export function createLucidAttachmentProcessor(
  app: ApplicationService,
  options: CreateLucidAttachmentProcessorOptions = {}
): AttachmentJobProcessor {
  const repository = options.repository ?? new LucidAttachmentRepository()
  const converters = options.converters ?? createContainerConverterRegistry(app)

  return new AttachmentJobProcessor({
    attachments: repository,
    async variants() {
      const attachments = await app.container.make('jrmc.attachment')
      return new LucidVariantGenerationService({
        attachments,
        generator: new VariantGenerationService({ attachments, converters }),
        store: new LucidAttachmentStore(),
      })
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
