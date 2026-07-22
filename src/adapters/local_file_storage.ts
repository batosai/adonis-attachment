/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { ApplicationService } from '@adonisjs/core/types'

import type { AttachmentStorage, StorageLocation, WriteAttachmentInput } from '../core/storage.js'
import { AttachmentError } from '../errors.js'

export type LocalFileStorageOptions = {
  location: string
  disk?: string
}

/**
 * Stores attachment bytes on the local filesystem without requiring Drive.
 */
export class LocalFileStorage implements AttachmentStorage {
  readonly #location: string
  readonly defaultDisk: string

  constructor(options: LocalFileStorageOptions) {
    this.#location = resolve(options.location)
    this.defaultDisk = options.disk ?? 'fs'
  }

  static fromApp(app: ApplicationService): LocalFileStorage {
    return new LocalFileStorage({ location: app.makePath('storage/attachments') })
  }

  async write(input: WriteAttachmentInput): Promise<void> {
    const filePath = this.#resolve(input)
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`

    await mkdir(dirname(filePath), { recursive: true })

    try {
      await writeFile(temporaryPath, input.body)
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
