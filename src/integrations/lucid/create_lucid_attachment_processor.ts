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
import type { LucidJsonAttachmentRegistry } from './json/lucid_json_attachment_registry.js'
import { LucidJsonVariantGenerationService } from './json/lucid_json_variant_generation_service.js'

export type CreateLucidAttachmentProcessorOptions = {
  repository?: AttachmentRepository
  converters?: VariantConverterRegistry
  events?: AttachmentEventEmitter
  jsonPersistence?: LucidJsonAttachmentRegistry
}

/** Creates the standard Lucid processor used by memory and external queue workers. */
export function createLucidAttachmentProcessor(
  app: ApplicationService,
  options: CreateLucidAttachmentProcessorOptions = {}
): AttachmentJobProcessor {
  const json = () => options.jsonPersistence
    ? Promise.resolve(options.jsonPersistence)
    : app.container.make('jrmc.attachment.json')
  const tables = new LucidAttachmentRepository()
  const repository = options.repository ?? {
    findById: tables.findById.bind(tables),
    async findByReference(reference) {
      return reference.adapter === 'json'
        ? (await json()).findByReference(reference)
        : tables.findByReference(reference)
    },
  } satisfies AttachmentRepository
  const converters = options.converters ?? createContainerConverterRegistry(app)

  return new AttachmentJobProcessor({
    attachments: repository,
    async variants() {
      const attachments = await app.container.make('jrmc.attachment')
      const tableVariants = new LucidVariantGenerationService({
        attachments,
        generator: new VariantGenerationService({ attachments, converters }),
        store: new LucidAttachmentStore(),
      })
      return {
        async generate(request) {
          if (request.attachment.reference?.adapter !== 'json') return tableVariants.generate(request)
          const registry = await json()
          // Publishing a generated file must never overwrite an existing variant,
          // even when application defaults use rename:false for original uploads.
          const generator = new VariantGenerationService({
            converters,
            attachments: {
              read: attachments.read.bind(attachments), remove: attachments.remove.bind(attachments),
              getVariantMetadataEnabled: attachments.getVariantMetadataEnabled.bind(attachments),
              create: (input) => attachments.createDraft(input, { rename: true }).persist(),
              createDraft: (input) => attachments.createDraft(input, { rename: true }),
            },
          })
          return new LucidJsonVariantGenerationService({ attachments, generator, registry }).generate(request)
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
