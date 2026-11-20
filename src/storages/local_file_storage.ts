/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { createReadStream, createWriteStream } from 'node:fs'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { ApplicationService } from '@adonisjs/core/types'

import type { AttachmentStorage, AttachmentStorageContext, StorageLocation, WriteAttachmentInput } from '../core/storage.js'
import { AttachmentError } from '../errors.js'

export type LocalFileStorageOptions = {
  location: string
  disk?: string
  /** Public base URL for files served from this storage location. */
  baseUrl?: string
}

/**
 * Stores attachment bytes on the local filesystem without requiring Drive.
 */
export class LocalFileStorage implements AttachmentStorage {
  readonly #location: string
  readonly #baseUrl: string | undefined
  readonly defaultDisk: string

  constructor(options: LocalFileStorageOptions) {
    this.#location = resolve(options.location)
    this.defaultDisk = options.disk ?? 'fs'
    this.#baseUrl = options.baseUrl?.replace(/\/+$/, '')
  }

  static fromApp(app: ApplicationService, context: AttachmentStorageContext = {}): LocalFileStorage {
    return LocalFileStorage.configure()(app, context)
  }

  static configure(options: Partial<LocalFileStorageOptions> = {}) {
    return (app: ApplicationService, _context: AttachmentStorageContext): LocalFileStorage =>
      new LocalFileStorage({ ...options, location: options.location ?? app.makePath('storage/attachments') })
  }

  async write(input: WriteAttachmentInput): Promise<void> {
    await this.#write(input, (path) => writeFile(path, input.body, { flag: 'wx' }))
  }

  async readStream(location: StorageLocation): Promise<Readable> {
    return createReadStream(this.#resolve(location))
  }

  async writeStream(input: Omit<WriteAttachmentInput, 'body'> & { stream: Readable }): Promise<void> {
    try {
      await this.#write(input, (path) => pipeline(input.stream, createWriteStream(path, { flags: 'wx' })))
    } finally {
      input.stream.destroy()
    }
  }

  async #write(location: StorageLocation, write: (path: string) => Promise<void>): Promise<void> {
    const filePath = this.#resolve(location)
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`

    await mkdir(dirname(filePath), { recursive: true })

    try {
      await write(temporaryPath)
      await rename(temporaryPath, filePath)
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  async read(location: StorageLocation): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.#resolve(location)))
  }

  async remove(location: StorageLocation): Promise<void> {
    await rm(this.#resolve(location), { force: true })
  }

  async getUrl(location: StorageLocation): Promise<string | undefined> {
    this.#resolve(location)
    if (!this.#baseUrl) {
      return undefined
    }

    return `${this.#baseUrl}/${location.path.split('/').map(encodeURIComponent).join('/')}`
  }

  #resolve(location: StorageLocation): string {
    if (location.disk !== this.defaultDisk) {
      throw new AttachmentError(`LocalFileStorage cannot access the "${location.disk}" disk`, {
        code: 'E_STORAGE_DISK_NOT_FOUND',
        status: 404,
      })
    }

    const filePath = resolve(this.#location, location.path)
    const pathFromRoot = relative(this.#location, filePath)

    if (!pathFromRoot || pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`)) {
      throw new AttachmentError('Attachment paths must stay inside the local storage directory', {
        code: 'E_STORAGE_PATH_OUTSIDE_ROOT',
        status: 400,
      })
    }

    return filePath
  }
}
