/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import {
  AttachmentDraft,
  AttachmentFactory,
  type Attachment,
  type AttachmentPersistRequest,
  type CreateAttachmentInput,
} from './attachment.js'
import { markAttachmentPending } from './attachment_state.js'
import {
  resolveAttachmentPersistenceOptions,
  type AttachmentFolder,
  type AttachmentPersistenceContext,
  type AttachmentPersistenceOptions,
  type AttachmentRename,
} from './attachment_options.js'
import type { AttachmentQueue } from './queue.js'
import type { AttachmentMetadataPersister } from './attachment_metadata_persister.js'
import type { AttachmentStorage } from './storage.js'
import { MediaMetadataService, type MediaMetadataExtractor } from '../media/media_metadata.js'
import { AttachmentError } from '../errors.js'
import type { AttachmentVariantKey } from '../../index.js'
import {
  emitAttachmentEvent,
  toAttachmentEventFailure,
  type AttachmentEventContext,
  type AttachmentEventEmitter,
} from '../events/attachment_events.js'

export type AttachmentServiceOptions = {
  storage: AttachmentStorage
  queue: AttachmentQueue
  defaultDisk: string
  createId?: () => string
  defaults?: AttachmentPersistenceOptions
  metadataExtractors?: readonly MediaMetadataExtractor[]
  metadataMode?: AttachmentMetadataMode
  metadataPersister?: AttachmentMetadataPersister
  metadataVariants?: boolean
  events?: AttachmentEventEmitter
}

export type AttachmentMetadataMode = 'sync' | 'deferred'

/**
 * Creates files and delegates persistence to the configured storage backend.
 * Database persistence deliberately remains the responsibility of the caller.
 */
export class AttachmentService {
  readonly #storage: AttachmentStorage
  readonly #queue: AttachmentQueue
  readonly #factory: AttachmentFactory
  readonly #defaults: AttachmentPersistenceOptions
  readonly #metadata: MediaMetadataService | undefined
  readonly #metadataMode: AttachmentMetadataMode
  readonly #metadataPersister: AttachmentMetadataPersister | undefined
  readonly #metadataVariants: boolean
  readonly #events: AttachmentEventEmitter | undefined

  constructor(options: AttachmentServiceOptions) {
    this.#storage = options.storage
    this.#queue = options.queue
    this.#factory = new AttachmentFactory(options)
    this.#defaults = options.defaults ?? {}
    this.#metadata = options.metadataExtractors
      ? new MediaMetadataService(options.metadataExtractors)
      : undefined
    this.#metadataMode = options.metadataMode ?? 'sync'
    this.#metadataPersister = options.metadataPersister
    this.#metadataVariants = options.metadataVariants ?? true
    this.#events = options.events
  }

  createDraft(
    input: CreateAttachmentInput,
    options: AttachmentPersistenceOptions = {}
  ): AttachmentDraft {
    const draftOptions = {
      ...(input.disk !== undefined ? { disk: input.disk } : {}),
      ...(input.folder !== undefined ? { folder: input.folder } : {}),
      ...options,
    }
    const provisional = this.#factory.create(input, {
      ...(typeof draftOptions.disk === 'string' ? { disk: draftOptions.disk } : {}),
      ...(typeof draftOptions.folder === 'string' ? { folder: draftOptions.folder } : {}),
    })

    return new AttachmentDraft(input, provisional, draftOptions, (draft, request) =>
      this.#persistDraft(draft, request)
    )
  }

  /**
   * Backward-compatible immediate persistence for direct service consumers.
   */
  async create(input: CreateAttachmentInput): Promise<Attachment> {
    return this.createDraft(input).persist()
  }

  async #persistDraft(draft: AttachmentDraft, request?: AttachmentPersistRequest<any>): Promise<Attachment> {
    const source = draft.source
    const context: AttachmentPersistenceContext = {
      ...request?.context,
      originalName: source.originalName,
    }
    const options = resolveAttachmentPersistenceOptions(
      this.#defaults,
      request?.options,
      draft.options
    )
    const folder = await resolveFolder(options.folder, context)
    const name = await resolveName(options.rename, context)
    let attachment = this.#factory.create(source, {
      id: draft.id,
      ...(options.disk ? { disk: options.disk } : {}),
      ...(folder ? { folder } : {}),
      ...(name ? { name } : {}),
    })

    if (options.meta && this.#metadata && this.#metadataMode === 'sync') {
      this.#emit('attachment:metadata_started', attachment)
      try {
        const metadata = await this.#metadata.extract({ attachment, body: source.body })

        if (metadata) {
          attachment = {
            ...attachment,
            metadata: { ...metadata, ...(source.metadata ?? {}) },
          }
        }
        this.#emit('attachment:metadata_completed', attachment)
      } catch (error) {
        this.#emit('attachment:metadata_failed', attachment, undefined, undefined, error)
        throw error
      }
    }

    await this.#storage.write({
      disk: attachment.disk,
      path: attachment.path,
      body: source.body,
      mimeType: attachment.mimeType,
    })

    markAttachmentPending(draft)
    this.#emit('attachment:created', attachment)
    return attachment
  }

  async remove(attachment: Attachment): Promise<void> {
    await this.#storage.remove(attachment)
    this.#emit('attachment:deleted', attachment)
  }

  read(attachment: Attachment): Promise<Uint8Array> {
    return this.#storage.read({ disk: attachment.disk, path: attachment.path })
  }

  scheduleMetadataExtraction(
    attachment: Attachment,
    eventContext?: AttachmentEventContext
  ): Promise<void> {
    if (!this.#metadata || !this.#metadataPersister) {
      throw new DeferredMetadataNotConfiguredError()
    }

    return this.#queue.enqueue({
      type: 'extract-metadata',
      attachmentId: attachment.id,
      attachment,
      ...(eventContext ? { eventContext } : {}),
    })
  }

  async extractAndPersistMetadata(attachment: Attachment): Promise<void> {
    if (!this.#metadata || !this.#metadataPersister) {
      throw new DeferredMetadataNotConfiguredError()
    }

    const extracted = await this.#metadata.extract({ attachment, body: await this.read(attachment) })
    if (!extracted) {
      return
    }

    await this.#metadataPersister.persistMetadata(attachment, {
      ...extracted,
      ...(attachment.metadata ?? {}),
    })
  }

  scheduleVariantGeneration(
    attachment: Attachment,
    variantKeys?: readonly AttachmentVariantKey[],
    meta?: boolean,
    eventContext?: AttachmentEventContext
  ): Promise<void> {
    return this.#queue.enqueue({
      type: 'generate-variants',
      attachmentId: attachment.id,
      ...(variantKeys ? { variantKeys } : {}),
      ...(meta !== undefined ? { meta } : {}),
      ...(eventContext ? { eventContext } : {}),
    })
  }

  /** Resolves automatic variant keys with manager options taking precedence. */
  getVariantKeys(
    draft: AttachmentDraft,
    options?: AttachmentPersistenceOptions
  ): readonly AttachmentVariantKey[] | undefined {
    return resolveAttachmentPersistenceOptions(this.#defaults, options, draft.options).variants
  }

  /** Resolves whether variants should run the configured metadata extractors. */
  getVariantMetadataEnabled(
    draft: AttachmentDraft | undefined,
    options?: AttachmentPersistenceOptions
  ): boolean | undefined {
    return this.#metadataVariants
      ? resolveAttachmentPersistenceOptions(
      this.#defaults,
      options,
      draft?.options
        ).meta
      : undefined
  }

  /** Resolves the configured strategy when metadata is enabled for a persistence operation. */
  getMetadataMode(
    draft: AttachmentDraft | undefined,
    options?: AttachmentPersistenceOptions
  ): AttachmentMetadataMode | undefined {
    return resolveAttachmentPersistenceOptions(this.#defaults, options, draft?.options).meta
      ? this.#metadataMode
      : undefined
  }

  #emit(
    event: 'attachment:created' | 'attachment:deleted' | 'attachment:metadata_started' | 'attachment:metadata_completed' | 'attachment:metadata_failed',
    attachment: Attachment,
    variants?: readonly string[],
    context?: AttachmentEventContext,
    error?: unknown
  ): void {
    emitAttachmentEvent(this.#events, event, {
      ...(context ?? {}),
      attachment,
      ...(variants ? { variants } : {}),
      ...(error ? { error: toAttachmentEventFailure(error) } : {}),
    })
  }
}

export class DeferredMetadataNotConfiguredError extends AttachmentError {
  static code = 'E_METADATA_NOT_CONFIGURED'

  constructor() {
    super('Deferred metadata extraction requires configured extractors and a metadata persister')
    this.name = 'DeferredMetadataNotConfiguredError'
  }
}

async function resolveFolder(
  folder: AttachmentFolder | undefined,
  context: AttachmentPersistenceContext
): Promise<string | undefined> {
  if (typeof folder === 'function') {
    return folder(context)
  }

  return folder
}

async function resolveName(
  rename: AttachmentRename | undefined,
  context: AttachmentPersistenceContext
): Promise<string | undefined> {
  if (typeof rename === 'function') {
    return rename(context)
  }

  return rename === false ? context.originalName : undefined
}
