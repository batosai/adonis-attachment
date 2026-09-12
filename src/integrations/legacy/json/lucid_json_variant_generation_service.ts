import type { VariantGenerator, VariantGenerationRequest } from '../../../core/attachment_job_processor.js'
import type { AttachmentService } from '../../../core/attachment_service.js'
import type { VariantGenerationService } from '../../../variants/variant_generation_service.js'
import { AttachmentNotFoundError, AttachmentValidationError } from '../../../errors.js'
import type { LucidJsonAttachmentRegistry } from './lucid_json_attachment_registry.js'

/** Conversion is outside SQL locks; publishing and file effects follow the owner's transaction. */
export class LucidJsonVariantGenerationService implements VariantGenerator {
  constructor(private readonly options: {
    attachments: Pick<AttachmentService, 'remove' | 'getVariantMetadataEnabled' | 'getMetadataMode' | 'scheduleMetadataExtraction'>
    generator: Pick<VariantGenerationService, 'generateAll'>
    registry: LucidJsonAttachmentRegistry
  }) {}

  async generate(request: VariantGenerationRequest): Promise<void> {
    const reference = request.attachment.reference
    if (!reference || reference.id !== request.attachment.id) throw new AttachmentValidationError('JSON variant generation requires a matching reference')
    const store = await this.options.registry.storeFor(reference)
    const owner = reference.owner!
    const original = (await store.listOwnerLinks(owner)).find((entry) => entry.id === reference.id)
    if (!original) throw new AttachmentNotFoundError(reference.id)
    const meta = this.options.attachments.getVariantMetadataEnabled(undefined, request.meta !== undefined ? { meta: request.meta } : undefined)
    const variants = await this.options.generator.generateAll({ ...request, attachment: original.toAttachment(), ...(meta !== undefined ? { meta } : {}) })
    let entered = false
    const cleanup = async () => {
      const results = await Promise.allSettled(variants.map((item) => this.options.attachments.remove(item.attachment)))
      const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : [])
      if (errors.length) throw new AggregateError(errors, 'JSON variant file cleanup failed')
    }
    try {
      await store.transaction(owner, async (scoped) => {
        entered = true
        scoped.afterRollback(cleanup)
        // Revalidate after conversion: the owner may have replaced or removed the source.
        const current = (await scoped.listOwnerLinks(owner)).find((entry) => entry.id === original.id)
        if (!current) throw new AttachmentNotFoundError(original.id)
        if (current.toAttachment().path !== original.toAttachment().path || current.toAttachment().disk !== original.toAttachment().disk) {
          throw new AttachmentValidationError('JSON variant source file changed during conversion')
        }
        for (const variant of variants) {
          const persisted = request.mode === 'replace'
            ? await scoped.replaceVariant(current, variant.key, variant.attachment)
            : { variant: await scoped.createVariant(current, variant.key, variant.attachment), replaced: undefined }
          if (persisted.replaced) {
            const replaced = persisted.replaced
            scoped.afterCommit(() => this.options.attachments.remove(replaced))
          }
          if (this.options.attachments.getMetadataMode(undefined, meta !== undefined ? { meta } : undefined) === 'deferred') {
            scoped.afterCommit(() => this.options.attachments.scheduleMetadataExtraction(persisted.variant.toAttachment()))
          }
        }
      })
    } catch (error) {
      // Before the callback, no generated file was published. Once entered, only
      // confirmed rollback may clean files; ambiguous commit must retain them.
      if (!entered) {
        try { await cleanup() } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], 'JSON variant persistence and cleanup failed')
        }
      }
      throw error
    }
  }
}
