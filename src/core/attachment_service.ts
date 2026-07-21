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
import type { AttachmentStorage } from './storage.js'
import { MediaMetadataService, type MediaMetadataExtractor } from '../media/media_metadata.js'

export type AttachmentServiceOptions = {
  storage: AttachmentStorage
  queue: AttachmentQueue
  defaultDisk: string
  createId?: () => string
  defaults?: AttachmentPersistenceOptions
  metadataExtractors?: readonly MediaMetadataExtractor[]
}

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

  constructor(options: AttachmentServiceOptions) {
    this.#storage = options.storage
    this.#queue = options.queue
    this.#factory = new AttachmentFactory(options)
    this.#defaults = options.defaults ?? {}
    this.#metadata = options.metadataExtractors
      ? new MediaMetadataService(options.metadataExtractors)
      : undefined
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

    if (options.meta && this.#metadata) {
      const metadata = await this.#metadata.extract({ attachment, body: source.body })

      if (metadata) {
        attachment = {
          ...attachment,
          metadata: { ...metadata, ...(source.metadata ?? {}) },
        }
      }
    }

    await this.#storage.write({
      disk: attachment.disk,
      path: attachment.path,
      body: source.body,
      mimeType: attachment.mimeType,
    })

    markAttachmentPending(draft)
    return attachment
  }

  remove(attachment: Attachment): Promise<void> {
    return this.#storage.remove(attachment)
  }

  read(attachment: Attachment): Promise<Uint8Array> {
    return this.#storage.read({ disk: attachment.disk, path: attachment.path })
  }

  scheduleVariantGeneration(
    attachment: Attachment,
    variantKeys?: readonly string[]
  ): Promise<void> {
    return this.#queue.enqueue({
      type: 'generate-variants',
      attachmentId: attachment.id,
      ...(variantKeys ? { variantKeys } : {}),
    })
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
