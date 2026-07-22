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
}>

export type AttachmentPersistRequest<Model = any> = {
  options?: AttachmentPersistenceOptions<Model>
  context?: Omit<AttachmentPersistenceContext<Model>, 'originalName'>
}

export type AttachmentDraftPersistence = (
  draft: AttachmentDraft,
  request?: AttachmentPersistRequest<any>
) => Promise<Attachment>

export type CreateAttachmentInput = {
  body: Uint8Array
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
      throw new Error('Attachment draft source is no longer available after persistence')
    }

    return this.#source
  }

  get options(): Readonly<AttachmentPersistenceOptions> {
    return this.#options
  }

  persist(request?: AttachmentPersistRequest<any>): Promise<Attachment> {
    if (this.#persisted) {
      return Promise.resolve(this)
    }

    if (!this.#persisting) {
      this.#persisting = this.#persistence(this, request)
        .then((attachment) => {
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
      throw new Error('Attachment drafts must be persisted before serialization')
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
      size: input.body.byteLength,
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
    throw new Error('Attachment names must not contain path separators')
  }

  if (!folder) {
    return name
  }

  const normalizedFolder = folder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')

  if (!normalizedFolder || normalizedFolder.split('/').includes('..')) {
    throw new Error('Attachment folder must be a relative path without parent segments')
  }

  return `${normalizedFolder}/${name}`
}
