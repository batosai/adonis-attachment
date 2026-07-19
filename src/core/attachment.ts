/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'

export type Attachment = Readonly<{
  id: string
  disk: string
  name: string
  originalName: string
  path: string
  size: number
  extname: string
  mimeType: string
  metadata?: Record<string, unknown>
}>

export type CreateAttachmentInput = {
  body: Uint8Array
  originalName: string
  mimeType?: string
  disk?: string
  folder?: string
  metadata?: Record<string, unknown>
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

  create(input: CreateAttachmentInput): Attachment {
    const id = this.#createId()
    const extension = getExtension(input.originalName)
    const name = extension ? `${id}.${extension}` : id
    const path = joinPath(input.folder, name)

    return {
      id,
      disk: input.disk ?? this.#defaultDisk,
      name,
      originalName: input.originalName,
      path,
      size: input.body.byteLength,
      extname: extension,
      mimeType: input.mimeType ?? 'application/octet-stream',
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }
  }
}

function getExtension(fileName: string): string {
  return extname(fileName).slice(1).toLowerCase()
}

function joinPath(folder: string | undefined, name: string): string {
  if (!folder) {
    return name
  }

  const normalizedFolder = folder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')

  if (!normalizedFolder || normalizedFolder.split('/').includes('..')) {
    throw new Error('Attachment folder must be a relative path without parent segments')
  }

  return `${normalizedFolder}/${name}`
}
