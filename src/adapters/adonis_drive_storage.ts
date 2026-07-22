/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { configProvider } from '@adonisjs/core'
import type { ApplicationService } from '@adonisjs/core/types'

import type { AttachmentStorage, StorageLocation, WriteAttachmentInput } from '../core/storage.js'
import { AttachmentError } from '../errors.js'

export type AdonisDriveDisk = {
  put(path: string, contents: Uint8Array): Promise<void>
  getBytes(path: string): Promise<Uint8Array>
  delete(path: string): Promise<void>
}

/**
 * Structural subset of Adonis DriveService. Keeping it local makes this adapter
 * optional while still accepting the real Drive service through TypeScript's structural typing.
 */
export type AdonisDriveService = {
  use(disk?: string): AdonisDriveDisk
}

export class AdonisDriveStorage implements AttachmentStorage {
  readonly #drive: AdonisDriveService
  readonly defaultDisk: string | undefined

  constructor(drive: AdonisDriveService, defaultDisk?: string) {
    this.#drive = drive
    this.defaultDisk = defaultDisk
  }

  /**
   * Creates a Drive adapter using the default disk declared in config/drive.ts.
   */
  static async fromApp(app: ApplicationService): Promise<AdonisDriveStorage> {
    const config = await configProvider.resolve<{ config: { default: string } }>(
      app,
      app.config.get('drive')
    )

    if (!config) {
      throw new AttachmentError('Drive config is required when using AdonisDriveStorage.fromApp', {
        code: 'E_DRIVE_CONFIG_NOT_FOUND',
      })
    }

    return new AdonisDriveStorage(
      (await app.container.make('drive.manager')) as AdonisDriveService,
      config.config.default
    )
  }

  async write(input: WriteAttachmentInput): Promise<void> {
    await this.#drive.use(input.disk).put(input.path, input.body)
  }

  read(location: StorageLocation): Promise<Uint8Array> {
    return this.#drive.use(location.disk).getBytes(location.path)
  }

  async remove(location: StorageLocation): Promise<void> {
    await this.#drive.use(location.disk).delete(location.path)
  }
}
