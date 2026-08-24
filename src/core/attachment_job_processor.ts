/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from './attachment.js'
import type { AttachmentJob, VariantGenerationMode } from './queue.js'
import type { AttachmentRepository } from './attachment_repository.js'
import { AttachmentError } from '../errors.js'
import {
  emitAttachmentEvent,
  toAttachmentEventFailure,
  type AttachmentEventContext,
  type AttachmentEventEmitter,
} from '../events/attachment_events.js'

export type VariantGenerationRequest = {
  attachment: Attachment
  variantKeys?: readonly string[]
  meta?: boolean
  mode?: VariantGenerationMode
}

export interface VariantGenerator {
  generate(request: VariantGenerationRequest): Promise<void>
}

export type VariantGeneratorFactory = () => VariantGenerator | Promise<VariantGenerator>

export type AttachmentJobProcessorOptions = {
  attachments: AttachmentRepository
  variants: VariantGenerator | VariantGeneratorFactory
  metadata?: DeferredAttachmentMetadataProcessor
  events?: AttachmentEventEmitter
}

export type DeferredAttachmentMetadataProcessor = {
  extractAndPersistMetadata(attachment: Attachment): Promise<void>
}

export class AttachmentJobProcessor {
  readonly #attachments: AttachmentRepository
  readonly #variants: VariantGenerator | VariantGeneratorFactory
  readonly #metadata: DeferredAttachmentMetadataProcessor | undefined
  #events: AttachmentEventEmitter | undefined
  #defaultEvents: Promise<AttachmentEventEmitter | undefined> | undefined
  #resolvedVariants: Promise<VariantGenerator> | undefined

  constructor(options: AttachmentJobProcessorOptions) {
    this.#attachments = options.attachments
    this.#variants = options.variants
    this.#metadata = options.metadata
    this.#events = options.events
  }

  /** Overrides the event emitter after construction, for config-driven workers. */
  setEventEmitter(events: AttachmentEventEmitter): void {
    this.#events = events
  }

  async process(job: AttachmentJob): Promise<void> {
    switch (job.type) {
      case 'generate-variants':
        await this.#generateVariants(job.attachmentId, job.variantKeys, job.meta, job.eventContext, job.mode)
        return
      case 'extract-metadata':
        if (!this.#metadata) {
          throw new DeferredMetadataProcessorNotConfiguredError()
        }
        await this.#extractMetadata(job.attachment, job.eventContext)
        return
    }
  }

  async #generateVariants(
    attachmentId: string,
    variantKeys?: readonly string[],
    meta?: boolean,
    eventContext?: AttachmentEventContext,
    mode?: VariantGenerationMode
  ): Promise<void> {
    const attachment = await this.#attachments.findById(attachmentId)

    if (!attachment) {
      throw new AttachmentNotFoundError(attachmentId)
    }

    await this.#emit('attachment:variant_started', attachment, variantKeys, eventContext)
    try {
      const variants = await this.#getVariants()
      await variants.generate({
        attachment,
        ...(variantKeys ? { variantKeys } : {}),
        ...(meta !== undefined ? { meta } : {}),
        ...(mode ? { mode } : {}),
      })
      await this.#emit('attachment:variant_completed', attachment, variantKeys, eventContext)
    } catch (error) {
      await this.#emit('attachment:variant_failed', attachment, variantKeys, eventContext, error)
      throw error
    }
  }

  async #extractMetadata(attachment: Attachment, eventContext?: AttachmentEventContext): Promise<void> {
    await this.#emit('attachment:metadata_started', attachment, undefined, eventContext)
    try {
      await this.#metadata!.extractAndPersistMetadata(attachment)
      await this.#emit('attachment:metadata_completed', attachment, undefined, eventContext)
    } catch (error) {
      await this.#emit('attachment:metadata_failed', attachment, undefined, eventContext, error)
      throw error
    }
  }

  #getVariants(): Promise<VariantGenerator> {
    if (typeof this.#variants !== 'function') {
      return Promise.resolve(this.#variants)
    }

    this.#resolvedVariants ??= Promise.resolve(this.#variants())
    return this.#resolvedVariants
  }

  async #emit(
    event: 'attachment:variant_started' | 'attachment:variant_completed' | 'attachment:variant_failed' | 'attachment:metadata_started' | 'attachment:metadata_completed' | 'attachment:metadata_failed',
    attachment: Attachment,
    variants?: readonly string[],
    context?: AttachmentEventContext,
    error?: unknown
  ): Promise<void> {
    emitAttachmentEvent(await this.#getEvents(), event, {
      ...(context ?? {}),
      attachment,
      ...(variants ? { variants } : {}),
      ...(error ? { error: toAttachmentEventFailure(error) } : {}),
    })
  }

  #getEvents(): Promise<AttachmentEventEmitter | undefined> {
    if (this.#events) {
      return Promise.resolve(this.#events)
    }

    this.#defaultEvents ??= this.#resolveAdonisEmitter()
    return this.#defaultEvents
  }

  async #resolveAdonisEmitter(): Promise<AttachmentEventEmitter | undefined> {
    try {
      const [{ AdonisAttachmentEventEmitter }, { default: emitter }] = await Promise.all([
        import('../events/adonis_attachment_event_emitter.js'),
        import('@adonisjs/core/services/emitter'),
      ])
      return new AdonisAttachmentEventEmitter(emitter)
    } catch {
      return undefined
    }
  }
}

export class AttachmentNotFoundError extends AttachmentError {
  static code = 'E_ATTACHMENT_NOT_FOUND'
  static status = 404

  constructor(attachmentId: string) {
    super(`Attachment "${attachmentId}" was not found`)
    this.name = 'AttachmentNotFoundError'
  }
}

export class DeferredMetadataProcessorNotConfiguredError extends AttachmentError {
  static code = 'E_METADATA_PROCESSOR_NOT_CONFIGURED'

  constructor() {
    super('Attachment metadata jobs require a configured metadata processor')
    this.name = 'DeferredMetadataProcessorNotConfiguredError'
  }
}
