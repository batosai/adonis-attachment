/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { basename, extname } from 'node:path'
import { readFile, stat } from 'node:fs/promises'

import type { Readable } from 'node:stream'

import type { AttachmentDraft, CreateAttachmentInput } from '../core/attachment.js'
import type { AttachmentPersistenceOptions } from '../core/attachment_options.js'
import type { AttachmentService } from '../core/attachment_service.js'

export type MultipartAttachmentFile = {
  tmpPath?: string
  clientName: string
  type?: string
  subtype?: string
}

export type AttachmentSourceOptions = AttachmentPersistenceOptions & {
  originalName?: string
  mimeType?: string
  metadata?: CreateAttachmentInput['metadata']
  maxBytes?: number
}

export type AttachmentSourceResponse = {
  ok: boolean
  status: number
  statusText: string
  headers: Pick<Headers, 'get'>
  arrayBuffer(): Promise<ArrayBuffer>
}

export type AttachmentSourceFetch = (
  input: URL | string
) => Promise<AttachmentSourceResponse>

export type AttachmentManagerOptions = {
  maxBytes?: number
  fetch?: AttachmentSourceFetch
}

/**
 * Normalizes common input sources into drafts. The file is written only when the
 * caller invokes `draft.persist()` or an integration persists it automatically.
 */
export class AttachmentManager {
  readonly #attachments: Pick<AttachmentService, 'createDraft'>
  readonly #maxBytes: number | undefined
  readonly #fetch: AttachmentSourceFetch

  constructor(attachments: Pick<AttachmentService, 'createDraft'>, options: AttachmentManagerOptions = {}) {
    if (options.maxBytes !== undefined && (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1)) {
      throw new Error('Attachment source maxBytes must be a positive integer')
    }

    this.#attachments = attachments
    this.#maxBytes = options.maxBytes
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  createFromBuffer(input: Uint8Array, options: AttachmentSourceOptions = {}): Promise<AttachmentDraft> {
    return this.#create(input, {
      originalName: options.originalName ?? 'attachment.bin',
      mimeType: options.mimeType ?? mimeTypeFromName(options.originalName),
      options,
    })
  }

  createFromBase64(input: string, options: AttachmentSourceOptions = {}): Promise<AttachmentDraft> {
    const parsed = parseBase64(input)

    return this.#create(parsed.body, {
      originalName: options.originalName ?? 'attachment.bin',
      mimeType: options.mimeType ?? parsed.mimeType ?? mimeTypeFromName(options.originalName),
      options,
    })
  }

  async createFromPath(input: string, options: AttachmentSourceOptions = {}): Promise<AttachmentDraft> {
    const file = await stat(input)
    this.#assertSize(file.size, options.maxBytes)
    const body = await readFile(input)
    const originalName = options.originalName ?? basename(input)

    return this.#create(body, {
      originalName,
      mimeType: options.mimeType ?? mimeTypeFromName(originalName),
      options,
    })
  }

  async createFromStream(input: Readable, options: AttachmentSourceOptions = {}): Promise<AttachmentDraft> {
    const chunks: Uint8Array[] = []
    let size = 0

    for await (const chunk of input) {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : new Uint8Array(chunk)
      size += bytes.byteLength
      this.#assertSize(size, options.maxBytes)
      chunks.push(bytes)
    }

    const originalName = options.originalName ?? 'attachment.bin'
    return this.#create(Buffer.concat(chunks), {
      originalName,
      mimeType: options.mimeType ?? mimeTypeFromName(originalName),
      options,
    })
  }

  async createFromUrl(input: URL | string, options: AttachmentSourceOptions = {}): Promise<AttachmentDraft> {
    const response = await this.#fetch(input)

    if (!response.ok) {
      throw new AttachmentSourceError(
        `Unable to download attachment source: ${response.status} ${response.statusText}`
      )
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && Number.isSafeInteger(Number(contentLength))) {
      this.#assertSize(Number(contentLength), options.maxBytes)
    }

    const body = new Uint8Array(await response.arrayBuffer())
    const url = typeof input === 'string' ? new URL(input) : input
    const originalName = options.originalName ?? (basename(url.pathname) || 'attachment.bin')

    return this.#create(body, {
      originalName,
      mimeType: options.mimeType ?? normalizeMimeType(response.headers.get('content-type')) ?? mimeTypeFromName(originalName),
      options,
    })
  }

  createFromFile(input: MultipartAttachmentFile, options: AttachmentSourceOptions = {}): Promise<AttachmentDraft> {
    if (!input.tmpPath) {
      throw new AttachmentSourceError('Multipart attachment file has no temporary path')
    }

    return this.createFromPath(input.tmpPath, {
      ...options,
      originalName: options.originalName ?? input.clientName,
      mimeType: options.mimeType ?? multipartMimeType(input),
    })
  }

  createFromFiles(
    inputs: readonly MultipartAttachmentFile[],
    options: AttachmentSourceOptions = {}
  ): Promise<AttachmentDraft[]> {
    return Promise.all(inputs.map((input) => this.createFromFile(input, options)))
  }

  async #create(
    body: Uint8Array,
    input: { originalName: string; mimeType: string; options: AttachmentSourceOptions }
  ): Promise<AttachmentDraft> {
    this.#assertSize(body.byteLength, input.options.maxBytes)

    return this.#attachments.createDraft({
      body,
      originalName: input.originalName,
      mimeType: input.mimeType,
      ...(input.options.metadata ? { metadata: input.options.metadata } : {}),
    }, toPersistenceOptions(input.options))
  }

  #assertSize(size: number, override: number | undefined): void {
    if (override !== undefined && (!Number.isSafeInteger(override) || override < 1)) {
      throw new Error('Attachment source maxBytes must be a positive integer')
    }

    const maxBytes =
      override === undefined
        ? this.#maxBytes
        : this.#maxBytes === undefined
          ? override
          : Math.min(override, this.#maxBytes)

    if (maxBytes !== undefined && size > maxBytes) {
      throw new AttachmentSourceError(`Attachment source exceeds the ${maxBytes}-byte limit`)
    }
  }
}

function toPersistenceOptions(options: AttachmentSourceOptions): AttachmentPersistenceOptions {
  return {
    ...(options.disk !== undefined ? { disk: options.disk } : {}),
    ...(options.folder !== undefined ? { folder: options.folder } : {}),
    ...(options.rename !== undefined ? { rename: options.rename } : {}),
    ...(options.meta !== undefined ? { meta: options.meta } : {}),
    ...(options.preComputeUrl !== undefined ? { preComputeUrl: options.preComputeUrl } : {}),
    ...(options.variants !== undefined ? { variants: options.variants } : {}),
  }
}

export class AttachmentSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AttachmentSourceError'
  }
}

function parseBase64(input: string): { body: Uint8Array; mimeType?: string } {
  const dataUri = /^data:([^;,]+)?;base64,([A-Za-z0-9+/\s]*={0,2})$/i.exec(input)
  const mimeType = dataUri?.[1]
  const value = (dataUri?.[2] ?? input).replaceAll(/\s/g, '')

  if (!isBase64(value)) {
    throw new AttachmentSourceError('Attachment source must be valid Base64 data')
  }

  return { body: Buffer.from(value, 'base64'), ...(mimeType ? { mimeType } : {}) }
}

function isBase64(value: string): boolean {
  return value.length > 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
}

function multipartMimeType(input: MultipartAttachmentFile): string {
  return input.type && input.subtype
    ? `${input.type}/${input.subtype}`
    : mimeTypeFromName(input.clientName)
}

function normalizeMimeType(value: string | null): string | undefined {
  const mimeType = value?.split(';')[0]?.trim()
  return mimeType || undefined
}

function mimeTypeFromName(name: string | undefined): string {
  switch (extname(name ?? '').slice(1).toLowerCase()) {
    case 'avif': return 'image/avif'
    case 'gif': return 'image/gif'
    case 'jpeg':
    case 'jpg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'svg': return 'image/svg+xml'
    case 'webp': return 'image/webp'
    case 'pdf': return 'application/pdf'
    case 'doc': return 'application/msword'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'mp4': return 'video/mp4'
    case 'webm': return 'video/webm'
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    default: return 'application/octet-stream'
  }
}
