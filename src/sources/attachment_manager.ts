/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { basename, extname, join, resolve } from 'node:path'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { pipeline } from 'node:stream/promises'
import { mkdtemp, rm, stat } from 'node:fs/promises'

import type { Readable } from 'node:stream'

import type { AttachmentDraft, CreateAttachmentInput } from '../core/attachment.js'
import type { AttachmentPersistenceOptions } from '../core/attachment_options.js'
import type { AttachmentService } from '../core/attachment_service.js'
import { AttachmentSourceError } from '../errors.js'

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
  /** Provide a body stream to enforce maxBytes during download. */
  body?: ReadableStream<Uint8Array> | null
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
      throw new AttachmentSourceError('Attachment source maxBytes must be a positive integer', {
        code: 'E_INVALID_ATTACHMENT_SOURCE_OPTIONS',
      })
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
    const path = resolve(input)
    const file = await stat(path)
    this.#assertSize(file.size, options.maxBytes)
    if (!file.isFile()) throw new AttachmentSourceError('Attachment source must be a regular file')
    const originalName = options.originalName ?? basename(input)

    return this.#attachments.createDraft({
      file: { path, size: file.size },
      originalName,
      mimeType: options.mimeType ?? mimeTypeFromName(originalName),
      ...(options.metadata ? { metadata: options.metadata } : {}),
    }, toPersistenceOptions(options))
  }

  async createFromStream(input: Readable, options: AttachmentSourceOptions = {}): Promise<AttachmentDraft> {
    const originalName = options.originalName ?? 'attachment.bin'
    return this.#stage(input, originalName, options.mimeType ?? mimeTypeFromName(originalName), options)
  }

  async #stage(input: AsyncIterable<Uint8Array | string>, originalName: string, mimeType: string, options: AttachmentSourceOptions) {
    this.#assertSize(0, options.maxBytes)
    const directory = await mkdtemp(join(tmpdir(), 'adonis-attachment-import-'))
    const extension = extname(originalName)
    const path = join(directory, /^[.][a-z0-9]+$/i.test(extension) ? `source${extension}` : 'source')
    const cleanup = () => rm(directory, { recursive: true, force: true })
    let size = 0
    const count = (bytes: number) => {
      size += bytes
      this.#assertSize(size, options.maxBytes)
    }

    try {
      await pipeline(async function* () {
        for await (const chunk of input) {
          const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
          count(bytes.byteLength)
          yield bytes
        }
      }, createWriteStream(path, { flags: 'wx', mode: 0o600 }))
      return this.#attachments.createDraft({
        file: { path, size, cleanup },
        originalName,
        mimeType,
        ...(options.metadata ? { metadata: options.metadata } : {}),
      }, toPersistenceOptions(options))
    } catch (error) {
      await cleanup().catch(() => undefined)
      throw error
    }
  }

  async createFromUrl(input: URL | string, options: AttachmentSourceOptions = {}): Promise<AttachmentDraft> {
    this.#assertSize(0, options.maxBytes)
    const response = await this.#fetch(input)

    try {
      if (!response.ok) {
        throw new AttachmentSourceError(
          `Unable to download attachment source: ${response.status} ${response.statusText}`,
          { code: 'E_ATTACHMENT_SOURCE_DOWNLOAD_FAILED', status: 502 }
        )
      }

      const contentLength = response.headers.get('content-length')
      if (contentLength && Number.isSafeInteger(Number(contentLength))) {
        this.#assertSize(Number(contentLength), options.maxBytes)
      }

      const url = typeof input === 'string' ? new URL(input) : input
      const inferredName = basename(url.pathname)
      const mimeType = options.mimeType ?? normalizeMimeType(response.headers.get('content-type')) ?? mimeTypeFromName(inferredName)
      const originalName = options.originalName ?? inferUrlOriginalName(inferredName, mimeType)

      if (response.body) {
        return await this.#stage(readResponseStream(response.body), originalName, mimeType, options)
      }
      return await this.#create(new Uint8Array(await response.arrayBuffer()), { originalName, mimeType, options })
    } catch (error) {
      // Also stop downloads rejected from headers, before acquiring a reader.
      await response.body?.cancel(error).catch(() => undefined)
      throw error
    }
  }

  createFromFile(input: MultipartAttachmentFile, options: AttachmentSourceOptions = {}): Promise<AttachmentDraft> {
    if (!input.tmpPath) {
      throw new AttachmentSourceError('Multipart attachment file has no temporary path', {
        code: 'E_MULTIPART_SOURCE_PATH_MISSING',
      })
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
      throw new AttachmentSourceError('Attachment source maxBytes must be a positive integer', {
        code: 'E_INVALID_ATTACHMENT_SOURCE_OPTIONS',
      })
    }

    const maxBytes =
      override === undefined
        ? this.#maxBytes
        : this.#maxBytes === undefined
          ? override
          : Math.min(override, this.#maxBytes)

    if (maxBytes !== undefined && size > maxBytes) {
      throw new AttachmentSourceError(`Attachment source exceeds the ${maxBytes}-byte limit`, {
        code: 'E_ATTACHMENT_SOURCE_TOO_LARGE',
        status: 413,
      })
    }
  }
}

async function* readResponseStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      yield value
    }
  } finally {
    reader.releaseLock()
  }
}

function toPersistenceOptions(options: AttachmentSourceOptions): AttachmentPersistenceOptions {
  return {
    ...(options.disk !== undefined ? { disk: options.disk } : {}),
    ...(options.folder !== undefined ? { folder: options.folder } : {}),
    ...(options.rename !== undefined ? { rename: options.rename } : {}),
    ...(options.normalizeFileName !== undefined ? { normalizeFileName: options.normalizeFileName } : {}),
    ...(options.meta !== undefined ? { meta: options.meta } : {}),
    ...(options.preComputeUrl !== undefined ? { preComputeUrl: options.preComputeUrl } : {}),
    ...(options.variants !== undefined ? { variants: options.variants } : {}),
  }
}

export { AttachmentSourceError } from '../errors.js'

function parseBase64(input: string): { body: Uint8Array; mimeType?: string } {
  const dataUri = /^data:([^;,]+)?;base64,([A-Za-z0-9+/\s]*={0,2})$/i.exec(input)
  const mimeType = dataUri?.[1]
  const value = (dataUri?.[2] ?? input).replaceAll(/\s/g, '')

  if (!isBase64(value)) {
    throw new AttachmentSourceError('Attachment source must be valid Base64 data', {
      code: 'E_ISNOT_BASE64',
    })
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

function inferUrlOriginalName(name: string, mimeType: string): string {
  if (extname(name)) return name

  return `${name || 'attachment'}.${extensionFromMimeType(mimeType) ?? 'bin'}`
}

function extensionFromMimeType(mimeType: string): string | undefined {
  switch (mimeType.toLowerCase()) {
    case 'application/pdf': return 'pdf'
    case 'application/zip': return 'zip'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'docx'
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return 'pptx'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return 'xlsx'
    case 'image/avif': return 'avif'
    case 'image/gif': return 'gif'
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/svg+xml': return 'svg'
    case 'image/tiff': return 'tiff'
    case 'image/webp': return 'webp'
    case 'text/plain': return 'txt'
    case 'video/mp4': return 'mp4'
    case 'video/quicktime': return 'mov'
    case 'video/webm': return 'webm'
    default: return undefined
  }
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
