# Without Lucid

The package still runs inside Adonis; it is not a standalone framework-neutral service.
Keep `storage` configured. Select a custom `store` object/factory, or `store: false`
for application-owned persistence. Lucid is never detected automatically.

For a step-by-step class and factory example, see the
[Creating a store guide](https://next.adonis-attachment.jrmc.dev/guide/creating-a-store).
Its in-memory example is for learning; use shared persistent data for real applications
and external workers. A `fromApp(app, context)` factory can resolve the application's
ORM client. Do not resolve `jrmc.attachment` inside that factory (it depends on this config);
use the service passed to `variants()` later. Resolve the configured store through
`app.container.make('jrmc.attachment.store')` when application code needs its extra methods.
Config factories may be resolved for several bindings: reuse stateful stores per application
and resolve shared ORM clients through the container instead of creating isolated state per call.

```ts
import app from '@adonisjs/core/services/app'
import { attachmentManager, type Attachment } from '@jrmc/adonis-attachment'

// insertCommitted must resolve after the database transaction commits and reject on rollback.
export async function storeFile(bytes: Uint8Array, insertCommitted: (file: Attachment) => Promise<void>) {
  const service = await app.container.make('jrmc.attachment')
  const draft = await attachmentManager.createFromBuffer(bytes, {
    originalName: 'report.pdf', mimeType: 'application/pdf',
  })
  const attachment = await draft.persist()
  try {
    await insertCommitted(attachment)
  } catch (error) {
    try {
      await service.remove(attachment)
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Persistence and cleanup failed')
    }
    throw error
  }
  return attachment
}
```

This cleanup assumes rollback is certain. On an ambiguous commit outcome reconcile before
deleting a possibly referenced file. Crash recovery needs application-owned reconciliation.
Retain id, disk, path, name, originalName, mimeType, extname, size, and optional metadata and
blurhash. Do not persist computed URLs. Adapt the callback to the actual ORM, not an invented
`database` export from this package.

Implement `AttachmentRepository.findById(id): Promise<Attachment | null>` for workers and
the optional read route, then pass `store: { repository }` to `defineConfig`. Resolve variant IDs
as well as original IDs if serving both. Set `route: false` for private content.

For replacement, write to a new unique path, commit the new reference, then remove the old
file when unreferenced. A shared path with `rename: false` is not rollback-safe automatically
outside Lucid. Deletion, reference counts, variants, and retries belong to the application.

The root `attachmentService` export is a URL facade, not the full persistence service.
Resolve `const service = await app.container.make('jrmc.attachment')` for read, remove,
scheduling, and low-level variant generation. This container binding is typed by the package.

Queue only after committing the record. `variants` on a manager call does not automatically
schedule outside Lucid. `service.scheduleVariantGeneration(attachment, keys)`
schedules variants; `scheduleMetadataExtraction(attachment)` schedules deferred metadata.
Keep scheduling outside the database-failure cleanup catch: the record has already committed.
Use an outbox or equivalent application mechanism when commit-plus-enqueue must survive crashes.

For metadata, configure `store.metadataPersister.persistMetadata(attachment, metadata)`.
For variants, use `VariantGenerationService.generateAll(request)` and persist the returned
`{ key, attachment }[]` transactionally. Its `generate()` returns no files to record.
On rollback remove newly generated files; on regeneration replace rows uniquely by original
ID and variant key and remove old files only after commit. Expose that wrapper as `store.variants(service, converters, context)` alongside the repository;
`createAttachmentProcessor(app)` wires it for memory and external workers; do not discard low-level results or pretend it stores rows.

## Shared adapter factories

Storage, store and queue accept instances or sync/async `(app, context)` factories.
Use `LocalFileStorage.configure({ baseUrl })`, `AdonisDriveStorage.configure({ disk })`,
`LucidAttachmentStore.configure({ tableName })`, and `MemoryAttachmentQueue.configure({ concurrency })`
for native overrides. Import Lucid from `/lucid` and the other classes from the root.
`fromApp` uses defaults. `AdonisAttachmentQueue.configure({ job, queueName })` requires
an application forwarding job; there is no implicit default job.
Factories resolve storage first, then store, then queue. All receive `defaults` and `variant`;
storage receives optional explicit `defaultDisk`, the others the resolved disk.
A queue factory also receives optional `context.handler` assembled from the store or
`jobHandler`; use it after boot for custom in-process execution. External workers use
`createAttachmentProcessor(app)`. Never run the handler inside a config factory.
Existing one-argument factories, instances, queue driver shortcuts and named connections
remain valid. Do not add `false` for storage or queue; only store supports it.
