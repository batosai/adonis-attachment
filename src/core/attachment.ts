/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'

import type {
  AttachmentPersistenceContext,
  AttachmentPersistenceOptions,
} from './attachment_options.js'
import type { AttachmentMetadata } from '../media/media_metadata.js'
import { AttachmentError } from '../errors.js'
import type { AttachmentReference } from './attachment_reference.js'

export type Attachment = Readonly<{
  id: string
  disk: string
  name: string
  originalName: string
  path: string
  size: number
  extname: string
  mimeType: string
  blurhash?: string
  metadata?: AttachmentMetadata | undefined
  /** Runtime-only public URL. It is never persisted with the attachment. */
  url?: string
  /** Runtime/queue locator. Reconstructed by persistence adapters, not a stored column. */
  reference?: AttachmentReference
}>

export type AttachmentPersistRequest<Model = any> = {
  options?: AttachmentPersistenceOptions<Model>
  context?: Omit<AttachmentPersistenceContext<Model>, 'originalName'>
  /** Existing files that must survive replacement until the owning transaction commits. */
  protectedLocations?: readonly Pick<Attachment, 'disk' | 'path'>[]
}

export type AttachmentDraftPersistence = (
  draft: AttachmentDraft,
  request?: AttachmentPersistRequest<any>
) => Promise<Attachment>

export type CreateAttachmentInput = (
  | { body: Uint8Array; file?: never }
  | { body?: never; file: { path: string; size: number; cleanup?: () => Promise<void> } }
) & {
  originalName: string
  mimeType?: string
  blurhash?: string
  disk?: string
  folder?: string
  metadata?: AttachmentMetadata
}

/**
 * A source-backed attachment that has not been written to storage yet.
 * Its public properties become final after `persist()` resolves.
 */
export class AttachmentDraft implements Attachment {
  readonly id: string
  disk: string
  name: string
  originalName: string
  path: string
  size: number
  extname: string
  mimeType: string
  blurhash?: string
  metadata?: AttachmentMetadata | undefined

  readonly #options: AttachmentPersistenceOptions
  #source: CreateAttachmentInput | undefined
  #retained = 0
  #persisted = false
  #persisting: Promise<Attachment> | undefined
  readonly #persistence: AttachmentDraftPersistence

  constructor(
    source: CreateAttachmentInput,
    provisional: Attachment,
    options: AttachmentPersistenceOptions,
    persistence: AttachmentDraftPersistence
  ) {
    this.id = provisional.id
    this.disk = provisional.disk
    this.name = provisional.name
    this.originalName = provisional.originalName
    this.path = provisional.path
    this.size = provisional.size
    this.extname = provisional.extname
    this.mimeType = provisional.mimeType
    if (provisional.blurhash) {
      this.blurhash = provisional.blurhash
    }
    if (provisional.metadata) {
      this.metadata = provisional.metadata
    }
    this.#source = source
    this.#options = options
    this.#persistence = persistence
  }

  get isPersisted(): boolean {
    return this.#persisted
  }

  get source(): Readonly<CreateAttachmentInput> {
    if (!this.#source) {
      throw new AttachmentError('Attachment draft source is no longer available after persistence', {
        code: 'E_ATTACHMENT_DRAFT_SOURCE_UNAVAILABLE',
        status: 409,
      })
    }

    return this.#source
  }

  get options(): Readonly<AttachmentPersistenceOptions> {
    return this.#options
  }

  /** Internal integration checkpoint. Release it on commit, restore it after file cleanup. */
  retainForRollback(): { release(): Promise<void>; rollback(): void } {
    let source = this.#source
    if (source) this.#retained++
    return {
      release: async () => {
        if (!source) return
        const previous = source
        source = undefined
        this.#retained--
        await this.#cleanup(previous)
      },
      rollback: () => {
        if (source) {
          this.#source = source
          this.#persisted = false
          this.#persisting = undefined
          source = undefined
          this.#retained--
        }
      },
    }
  }

  async #cleanup(source?: CreateAttachmentInput): Promise<void> {
    if (!this.#source && this.#retained === 0) {
      try {
        await source?.file?.cleanup?.()
      } catch (error) {
        process.emitWarning(`Attachment source cleanup failed: ${String(error)}`)
      }
    }
  }

  /** Discards an unsaved draft and releases any temporary source it owns. */
  async discard(): Promise<void> {
    if ((this.#persisting && !this.#persisted) || this.#retained) {
      throw new AttachmentError('Cannot discard an attachment draft while it is being saved')
    }
    const source = this.#source
    this.#source = undefined
    await this.#cleanup(source)
  }

  persist(request?: AttachmentPersistRequest<any>): Promise<Attachment> {
    if (this.#persisted) {
      return Promise.resolve(this)
    }

    if (!this.#persisting) {
      if (!this.#source) return Promise.reject(new AttachmentError('Attachment draft source is unavailable'))
      const source = this.#source
      this.#persisting = this.#persistence(this, request)
        .then(async (attachment) => {
          this.disk = attachment.disk
          this.name = attachment.name
          this.path = attachment.path
          this.size = attachment.size
          this.extname = attachment.extname
          this.mimeType = attachment.mimeType
          if (attachment.blurhash) {
            this.blurhash = attachment.blurhash
          } else {
            delete this.blurhash
          }
          if (attachment.metadata) {
            this.metadata = attachment.metadata
          } else {
            delete this.metadata
          }
          this.#source = undefined
          await this.#cleanup(source)
          this.#persisted = true
          return this
        })
        .catch((error: unknown) => {
          this.#persisting = undefined
          throw error
        })
    }

    return this.#persisting!
  }

  toJSON(): Attachment {
    if (!this.#persisted) {
      throw new AttachmentError('Attachment drafts must be persisted before serialization', {
        code: 'E_ATTACHMENT_DRAFT_NOT_PERSISTED',
        status: 409,
      })
    }

    return this.toAttachment()
  }

  toAttachment(): Attachment {
    return {
      id: this.id,
      disk: this.disk,
      name: this.name,
      originalName: this.originalName,
      path: this.path,
      size: this.size,
      extname: this.extname,
      mimeType: this.mimeType,
      ...(this.blurhash ? { blurhash: this.blurhash } : {}),
      ...(this.metadata ? { metadata: this.metadata } : {}),
    }
  }
}

export function isAttachmentDraft(value: unknown): value is AttachmentDraft {
  return value instanceof AttachmentDraft
}

/** Drops runtime-only fields before an attachment is persisted as JSON or a blob row. */
export function toPersistedAttachment(attachment: Attachment): Attachment {
  const { url: _url, reference: _reference, ...persisted } = attachment
  return persisted
}

export type AttachmentFactoryOptions = {
  defaultDisk: string
  createId?: () => string
}

export class AttachmentFactory {
  readonly #defaultDisk: string
  readonly #createId: () => string

  constructor(options: AttachmentFactoryOptions) {
    this.#defaultDisk = options.defaultDisk
    this.#createId = options.createId ?? randomUUID
  }

  create(
    input: CreateAttachmentInput,
    options: { id?: string; name?: string; disk?: string; folder?: string } = {}
  ): Attachment {
    const id = options.id ?? this.#createId()
    const extension = getExtension(input.originalName)
    const name = options.name ?? (extension ? `${id}.${extension}` : id)
    const path = joinPath(options.folder ?? input.folder, name)

    return {
      id,
      disk: options.disk ?? input.disk ?? this.#defaultDisk,
      name,
      originalName: input.originalName,
      path,
      size: input.file ? input.file.size : input.body.byteLength,
      extname: extension,
      mimeType: input.mimeType ?? 'application/octet-stream',
      ...(input.blurhash ? { blurhash: input.blurhash } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }
  }
}

function getExtension(fileName: string): string {
  return extname(fileName).slice(1).toLowerCase()
}

function joinPath(folder: string | undefined, name: string): string {
  if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
    throw new AttachmentError('Attachment names must not contain path separators', {
      code: 'E_INVALID_ATTACHMENT_NAME',
      status: 400,
    })
  }

  if (!folder) {
    return name
  }

  const normalizedFolder = folder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')

  if (!normalizedFolder || normalizedFolder.split('/').includes('..')) {
    throw new AttachmentError('Attachment folder must be a relative path without parent segments', {
      code: 'E_INVALID_ATTACHMENT_FOLDER',
      status: 400,
    })
  }

  return `${normalizedFolder}/${name}`
}
