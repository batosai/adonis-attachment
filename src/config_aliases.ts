import type { AttachmentStoreFactory } from './core/attachment_store.js'
import type { LucidAttachmentStoreConfig } from './stores/lucid/config.js'
import { LocalFileStorage } from './storages/local_file_storage.js'
import { AdonisDriveStorage } from './storages/adonis_drive_storage.js'
import { MemoryAttachmentQueue } from './queues/memory_queue.js'
import { AdonisAttachmentQueue } from './queues/adonis_queue.js'

/** Persistence adapters, resolved when the application boots. */
export const store = {
  lucid(options?: LucidAttachmentStoreConfig): AttachmentStoreFactory {
    return async (app, context) => {
      // Keep Lucid optional for applications importing only storage or queue helpers.
      const { LucidAttachmentStore } = await import('./lucid.js')
      return options === undefined
        ? LucidAttachmentStore.fromApp(app, context)
        : LucidAttachmentStore.configure(options)(app, context)
    }
  },
}

/** Byte storage adapters using application defaults or explicit options. */
export const storage = {
  local(options?: Parameters<typeof LocalFileStorage.configure>[0]) {
    return options === undefined ? LocalFileStorage.fromApp : LocalFileStorage.configure(options)
  },
  drive(options?: Parameters<typeof AdonisDriveStorage.configure>[0]) {
    return options === undefined ? AdonisDriveStorage.fromApp : AdonisDriveStorage.configure(options)
  },
}

/** Job dispatch adapters. Adonis requires an application-defined forwarding job. */
export const queue = {
  memory(options?: Parameters<typeof MemoryAttachmentQueue.configure>[0]) {
    return options === undefined ? MemoryAttachmentQueue.fromApp : MemoryAttachmentQueue.configure(options)
  },
  adonis(options: Parameters<typeof AdonisAttachmentQueue.configure>[0]) {
    return AdonisAttachmentQueue.configure(options)
  },
}
