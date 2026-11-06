import {
  store, storage, queue, defineConfig, LocalFileStorage, AdonisDriveStorage, MemoryAttachmentQueue, AdonisAttachmentQueue,
  type AttachmentAdapterFactory, type AttachmentStorage, type AttachmentStorageConfig,
  type AttachmentStoreConfig, type AttachmentQueueAdapterConfig, type AttachmentQueueContext,
} from '@jrmc/adonis-attachment'
import { LucidAttachmentStore } from '@jrmc/adonis-attachment/lucid'
import type { AttachmentStorageFactory } from '@jrmc/adonis-attachment/core'

const storageFactory: AttachmentStorageFactory = (app, context) => {
  const explicitDisk: string | undefined = context.defaultDisk
  return LocalFileStorage.configure(explicitDisk ? { disk: explicitDisk } : {})(app, context)
}
const storages: AttachmentStorageConfig[] = [storageFactory, LocalFileStorage.fromApp, LocalFileStorage.configure(), AdonisDriveStorage.fromApp, AdonisDriveStorage.configure({ disk: 's3' })]
const stores: AttachmentStoreConfig[] = [false, LucidAttachmentStore.fromApp, LucidAttachmentStore.configure()]
const queues: AttachmentQueueAdapterConfig[] = [MemoryAttachmentQueue.fromApp, MemoryAttachmentQueue.configure({ concurrency: 2 }), AdonisAttachmentQueue.configure({ job: { dispatch() { return { toQueue() { return this }, async run() {} } } } })]
const customQueue: AttachmentQueueAdapterConfig = async (app, context) => {
  const resolvedDisk: string = context.defaultDisk
  app.config.get('attachment')
  void resolvedDisk
  return { async enqueue(job) { await context.handler?.(job) } }
}
const shared: AttachmentAdapterFactory<AttachmentStorage> = storageFactory
const oldOneArgumentFactory: AttachmentStorageConfig = (app) => LocalFileStorage.fromApp(app)

defineConfig({ storage: storageFactory, queue: { default: 'local', connections: { local: MemoryAttachmentQueue.fromApp, custom: customQueue } } })
// @ts-expect-error Storage remains required and cannot be disabled.
const disabledStorage: AttachmentStorageConfig = false
// @ts-expect-error Only store supports false; omitted queue selects memory.
const disabledQueue: AttachmentQueueAdapterConfig = false
// @ts-expect-error Queue context always provides a resolved defaultDisk.
const incompleteContext: AttachmentQueueContext = {}
// @ts-expect-error Memory configure obtains its handler from context, rather than overriding configuration.
MemoryAttachmentQueue.configure({ handler: async () => {} })
void [storages, stores, queues, shared, oldOneArgumentFactory, disabledStorage, disabledQueue, incompleteContext]

// Aliases use the same public adapter contracts, including named queues.
const aliasStorages: AttachmentStorageConfig[] = [storage.local(), storage.local({ location: '/tmp/uploads', baseUrl: '/files' }), storage.drive(), storage.drive({ disk: 's3' })]
const aliasStores: AttachmentStoreConfig[] = [store.lucid(), store.lucid({ tableName: 'media', legacy: { models: {} } })]
const aliasQueues: AttachmentQueueAdapterConfig[] = [queue.memory(), queue.memory({ concurrency: 2 }), queue.adonis({ job: { dispatch() { return { toQueue() { return this }, async run() {} } } } })]
defineConfig({ storage: storage.local(), store: store.lucid(), queue: { default: 'local', connections: { local: queue.memory() } } })
// @ts-expect-error Adonis still requires an application job.
queue.adonis()
// @ts-expect-error Adonis options must include a job.
queue.adonis({ queueName: 'media' })
// @ts-expect-error Memory handlers are supplied by configuration.
queue.memory({ handler: async () => {} })
// @ts-expect-error Drive has no local storage location option.
storage.drive({ location: '/tmp/uploads' })
// @ts-expect-error Lucid table names are strings.
store.lucid({ tableName: 123 })
void [aliasStorages, aliasStores, aliasQueues]
