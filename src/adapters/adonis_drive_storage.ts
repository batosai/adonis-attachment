import type { AttachmentStorage, StorageLocation, WriteAttachmentInput } from '../core/storage.js'

export type AdonisDriveDisk = {
  put(path: string, contents: Uint8Array): Promise<void>
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

  constructor(drive: AdonisDriveService) {
    this.#drive = drive
  }

  async write(input: WriteAttachmentInput): Promise<void> {
    await this.#drive.use(input.disk).put(input.path, input.body)
  }

  async remove(location: StorageLocation): Promise<void> {
    await this.#drive.use(location.disk).delete(location.path)
  }
}
