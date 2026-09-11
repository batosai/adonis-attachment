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
import { validateAttachmentReference } from './attachment_reference.js'
import {
  resolveAttachmentPersistenceOptions,
  type AttachmentFolder,
  type AttachmentPersistenceContext,
  type AttachmentPersistenceOptions,
  type AttachmentRename,
} from './attachment_options.js'
import type { AttachmentQueue, VariantGenerationMode } from './queue.js'
import type { AttachmentMetadataPersister } from './attachment_metadata_persister.js'
import type { AttachmentSignedUrlOptions, AttachmentStorage } from './storage.js'
import { MediaMetadataService, type MediaMetadataExtractor } from '../media/media_metadata.js'
import { AttachmentError } from '../errors.js'
import type { AttachmentVariantKey } from '../../index.js'
import {
  emitAttachmentEvent,
  toAttachmentEventFailure,
  type AttachmentEventContext,
  type AttachmentEventEmitter,
} from '../events/attachment_events.js'
import string from '@adonisjs/core/helpers/string'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'

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
    const name = await resolveName(options.rename, context, options.normalizeFileName !== false)
    let attachment = this.#factory.create(source, {
      id: draft.id,
      ...(options.disk ? { disk: options.disk } : {}),
      ...(folder ? { folder } : {}),
      ...(name ? { name } : {}),
    })

    if (request?.protectedLocations?.some((location) =>
      location.disk === attachment.disk && location.path === attachment.path
    )) {
      const directory = attachment.path.slice(0, -attachment.name.length)
      attachment = { ...attachment, path: `${directory}${randomUUID()}/${attachment.name}` }
    }

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

  getUrl(attachment: Attachment): Promise<string | undefined> {
    return attachment.url
      ? Promise.resolve(attachment.url)
      : this.#storage.getUrl?.({ disk: attachment.disk, path: attachment.path }) ?? Promise.resolve(undefined)
  }

  getSignedUrl(
    attachment: Attachment,
    options?: AttachmentSignedUrlOptions
  ): Promise<string | undefined> {
    return this.#storage.getSignedUrl?.(
      { disk: attachment.disk, path: attachment.path },
      options
    ) ?? Promise.resolve(undefined)
  }

  async preComputeUrl(attachment: Attachment): Promise<Attachment> {
    const url = await this.getUrl(attachment)
    return url ? { ...attachment, url } : attachment
  }

  getPreComputeUrlEnabled(options?: AttachmentPersistenceOptions): boolean {
    return resolveAttachmentPersistenceOptions(this.#defaults, options).preComputeUrl === true
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
      ...(attachment.reference !== undefined ? { reference: validateAttachmentReference(attachment.id, attachment.reference) } : {}),
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
    eventContext?: AttachmentEventContext,
    mode?: VariantGenerationMode
  ): Promise<void> {
    return this.#queue.enqueue({
      type: 'generate-variants',
      attachmentId: attachment.id,
      ...(attachment.reference !== undefined ? { reference: validateAttachmentReference(attachment.id, attachment.reference) } : {}),
      ...(variantKeys ? { variantKeys } : {}),
      ...(meta !== undefined ? { meta } : {}),
      ...(eventContext ? { eventContext } : {}),
      ...(mode ? { mode } : {}),
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
      : false
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
  const value = typeof folder === 'function' ? await folder(context) : folder

  return resolvePathParameters(value, context.model)
}

async function resolveName(
  rename: AttachmentRename | undefined,
  context: AttachmentPersistenceContext,
  normalizeFileName: boolean
): Promise<string | undefined> {
  let value: string | undefined

  if (typeof rename === 'function') {
    value = await rename(context)
  } else {
    value = rename === false ? context.originalName : undefined
  }

  const resolved = resolvePathParameters(value, context.model)
  return resolved && normalizeFileName ? normalizeStorageName(resolved) : resolved
}

/** Preserves v5 `:attribute` path parameters for string-valued model attributes. */
function resolvePathParameters(value: string | undefined, model: unknown): string | undefined {
  if (!value || !model || typeof model !== 'object') {
    return value
  }

  return value.replace(/:(\w+)/g, (parameter, attributeName: string) => {
    const attribute = getModelAttribute(model, attributeName)

    if (typeof attribute !== 'string') {
      return parameter
    }

    return string.slug(string.noCase(string.escapeHTML(attribute.toLowerCase())))
  })
}

function getModelAttribute(model: object, attributeName: string): unknown {
  const attributes = '$attributes' in model ? model.$attributes : undefined

  if (attributes && typeof attributes === 'object') {
    return (attributes as Record<string, unknown>)[attributeName]
  }

  return (model as Record<string, unknown>)[attributeName]
}

/**
 * Produces a portable object key while keeping the client-supplied originalName untouched.
 * Flydrive accepts only a limited ASCII set and rejects accented characters and apostrophes.
 */
function normalizeStorageName(name: string): string {
  if (name.includes('/') || name.includes('\\')) {
    return name
  }

  const extension = extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  const normalizedStem = normalizeStorageSegment(stem) || 'attachment'
  const normalizedExtension = extension ? normalizeStorageSegment(extension.slice(1)) : ''

  return normalizedExtension ? `${normalizedStem}.${normalizedExtension}` : normalizedStem
}

function normalizeStorageSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9!._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
