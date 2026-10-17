/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'
import { AttachmentJobProcessor } from './core/attachment_job_processor.js'
import type { AttachmentStore, AttachmentStoreContext } from './core/attachment_store.js'
import type { VariantConverterRegistry } from './converters/configured_variant_converter_registry.js'
import type { AttachmentEventEmitter } from './events/attachment_events.js'
import { AttachmentConfigurationError } from './errors.js'

export type CreateAttachmentProcessorOptions = {
  store?: AttachmentStore
  converters?: VariantConverterRegistry
  context?: AttachmentStoreContext
  events?: AttachmentEventEmitter
}

/** The same configured store is used by memory queues and external workers. */
export function createAttachmentProcessor(
  app: ApplicationService,
  options: CreateAttachmentProcessorOptions = {},
): AttachmentJobProcessor {
  // Resolve lazily: the service itself depends on the configured memory queue.
  const store = async () => options.store ?? (await app.container.make('jrmc.attachment.store'))
  const requiredStore = async () => {
    const resolved = await store()
    if (!resolved)
      throw new AttachmentConfigurationError(
        'Attachment jobs require a configured store or a custom jobHandler',
      )
    return resolved
  }
  return new AttachmentJobProcessor({
    attachments: {
      async findById(id) {
        return (await requiredStore()).repository.findById(id)
      },
      async findByReference(reference) {
        const repository = (await requiredStore()).repository
        if (!repository.findByReference)
          throw new AttachmentConfigurationError(
            'Attachment references require a reference-capable store repository',
          )
        return repository.findByReference(reference)
      },
    },
    async variants() {
      const selected = await requiredStore()
      if (!selected.variants)
        throw new AttachmentConfigurationError(
          'The configured attachment store does not support variant persistence',
        )
      const attachments = await app.container.make('jrmc.attachment')
      const converters =
        options.converters ?? (await app.container.make('jrmc.attachment.converters'))
      const context = options.context ?? (await app.container.make('jrmc.attachment.storeContext'))
      return selected.variants(attachments, converters, context)
    },
    metadata: {
      async extractAndPersistMetadata(attachment) {
        if (!(await requiredStore()).metadataPersister) {
          throw new AttachmentConfigurationError(
            'The configured attachment store does not support deferred metadata persistence',
          )
        }
        const attachments = await app.container.make('jrmc.attachment')
        await attachments.extractAndPersistMetadata(attachment)
      },
    },
    ...(options.events ? { events: options.events } : {}),
  })
}
