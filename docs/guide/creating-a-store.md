# Creating a store

A store connects attachment **data** to your application. Storage handles the file bytes;
the store lets routes and workers find files and persist processing results.

This guide builds a complete `ExampleAttachmentStore` class with a `fromApp` factory,
then adds metadata and variant persistence. All classes used below are defined here.
The example keeps records in memory so you can follow it without installing another ORM.
For Prisma, Kysely, another ORM, or SQL, replace the record operations with your data client.

::: warning Learning example
Records are lost on restart and are not shared between processes. Use the memory queue
with this example. An external worker needs a store backed by the same persistent database
as the web application. Persisting files alone does not make their in-memory records durable.
:::


Store factories follow the same `(app, context)` convention as storage and queue adapters.
Use `fromApp` for defaults and `configure(options)` for overrides when designing your class.
See [the common adapter pattern](/guide/configuration#a-common-adapter-pattern) for resolution
order, shared settings and queue handler wiring.

## 1. Start with the read capability

Only `repository` is required by `AttachmentStore`. It must return a plain `Attachment`
or `null` from `findById()`, including for variant IDs if you serve variants.

Create `app/attachments/example_attachment_store.ts`:

```ts [app/attachments/example_attachment_store.ts]
import type { ApplicationService } from '@adonisjs/core/types'
import {
  toPersistedAttachment,
  type Attachment,
  type AttachmentRepository,
  type AttachmentStore,
  type AttachmentStoreContext,
} from '@jrmc/adonis-attachment'

export default class ExampleAttachmentStore implements AttachmentStore {
  private static readonly instances = new WeakMap<ApplicationService, ExampleAttachmentStore>()
  protected records = new Map<string, Attachment>()

  static async fromApp(
    app: ApplicationService,
    _context: AttachmentStoreContext,
  ): Promise<ExampleAttachmentStore> {
    let store = ExampleAttachmentStore.instances.get(app)
    if (!store) {
      store = new ExampleAttachmentStore()
      ExampleAttachmentStore.instances.set(app, store)
    }
    return store
  }

  readonly repository: AttachmentRepository = {
    findById: async (id) => {
      const record = this.records.get(id)
      return record ? structuredClone(record) : null
    },
  }

  async insertOriginal(attachment: Attachment): Promise<void> {
    if (this.records.has(attachment.id)) {
      throw new Error(`Attachment ${attachment.id} already exists`)
    }
    this.records.set(attachment.id, structuredClone(toPersistedAttachment(attachment)))
  }
}
```

`insertOriginal()` is an application method, not part of the required store interface.
The package does not call it automatically. `toPersistedAttachment()` removes runtime
URLs and contextual references; retain all other attachment fields when mapping to columns.

The factory receives the booted application and an `AttachmentStoreContext` containing
`defaultDisk`, optional `defaults`, and optional `variant` settings. It can resolve your
ORM client from the container and pass it to the constructor. Avoid resolving
`jrmc.attachment` inside `fromApp`: the attachment service itself depends on this config.
The `variants()` capability receives the service later, after configuration is resolved.
Configuration can be resolved for multiple container bindings. The example uses a
`WeakMap` to keep one stateful store per application; an ORM-backed factory can instead
resolve shared client/store singletons registered by an application provider.

## 2. Select the store

Replace the generated `store: false` with the class factory. Keep the rest of your existing
configuration. This minimal example uses local storage and the default memory queue:

```ts [config/attachment.ts]
import { defineConfig, LocalFileStorage } from '@jrmc/adonis-attachment'
import ExampleAttachmentStore from '../app/attachments/example_attachment_store.js'

export default defineConfig({
  storage: LocalFileStorage.fromApp,
  store: ExampleAttachmentStore.fromApp,
})
```

An object instance or an async factory also works:

```ts
store: new ExampleAttachmentStore(),
// Or, when your constructor needs application dependencies:
store: (app, context) => ExampleAttachmentStore.fromApp(app, context),
```

No Lucid integration is activated. This store enables the built-in public read route,
unless you set `route: false`. It cannot yet persist variants or deferred metadata;
requesting those jobs fails explicitly. Synchronous metadata extraction still works.

## 3. Write a file, then its record

Resolve the **configured** store from the container. Creating another instance in your
controller would create a separate in-memory map that the route and workers cannot see.

The following function accepts already validated file bytes. Authorize and validate the
upload in the calling controller:

```ts [app/attachments/save_example_file.ts]
import type { ApplicationService } from '@adonisjs/core/types'
import { attachmentManager } from '@jrmc/adonis-attachment'
import ExampleAttachmentStore from './example_attachment_store.js'

export async function saveExampleFile(
  app: ApplicationService,
  bytes: Uint8Array,
  file: { originalName: string; mimeType: string },
) {
  const store = await app.container.make('jrmc.attachment.store')
  if (!(store instanceof ExampleAttachmentStore)) throw new Error('Select the example store first')
  const service = await app.container.make('jrmc.attachment')
  const draft = await attachmentManager.createFromBuffer(bytes, file)
  const attachment = await draft.persist()

  try {
    await store.insertOriginal(attachment)
  } catch (error) {
    try {
      await service.remove(attachment)
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Record insertion and cleanup failed')
    }
    throw error
  }

  return attachment
}
```

The default public route can now read `/attachments/<attachment.id>`. Disable that route
for private content and authorize an application route instead.

For an ORM, insertion must resolve after the transaction commits. Cleanup is safe only
after confirmed rollback; reconcile an uncertain commit outcome before deleting files.
Replacement, owner links, deletion, sharing and cleanup retries belong to your adapter.
See [the persistence workflow](/guide/custom-persistence) for those boundaries.

## 4. Add metadata and variants

An extended class can provide the optional processing capabilities. This example persists
metadata and supports **initial variant generation**. It deliberately rejects regeneration:
a production adapter must implement transactional replacement before accepting `mode: 'replace'`.

Create `app/attachments/processing_example_store.ts`:

```ts [app/attachments/processing_example_store.ts]
import type { ApplicationService } from '@adonisjs/core/types'
import {
  VariantGenerationService,
  toPersistedAttachment,
  type AttachmentMetadataPersister,
  type AttachmentService,
  type AttachmentStoreContext,
  type VariantConverterRegistry,
  type VariantGenerator,
} from '@jrmc/adonis-attachment'
import ExampleAttachmentStore from './example_attachment_store.js'

export default class ProcessingExampleStore extends ExampleAttachmentStore {
  private static readonly processingInstances = new WeakMap<ApplicationService, ProcessingExampleStore>()
  private readonly variantKeys = new Map<string, Set<string>>()

  static override async fromApp(
    app: ApplicationService,
    _context: AttachmentStoreContext,
  ): Promise<ProcessingExampleStore> {
    let store = ProcessingExampleStore.processingInstances.get(app)
    if (!store) {
      store = new ProcessingExampleStore()
      ProcessingExampleStore.processingInstances.set(app, store)
    }
    return store
  }

  readonly metadataPersister: AttachmentMetadataPersister = {
    persistMetadata: async (attachment, metadata) => {
      const current = this.records.get(attachment.id)
      if (!current) throw new Error('Attachment no longer exists')
      this.records.set(current.id, { ...current, metadata: structuredClone(metadata) })
    },
  }

  variants(
    service: AttachmentService,
    converters: VariantConverterRegistry,
    context: AttachmentStoreContext,
  ): VariantGenerator {
    const generator = new VariantGenerationService({
      attachments: {
        read: service.read.bind(service),
        remove: service.remove.bind(service),
        getVariantMetadataEnabled: service.getVariantMetadataEnabled.bind(service),
        // New paths keep generation from overwriting existing files before publication.
        create: (input) => service.createDraft(input, { rename: true }).persist(),
        createDraft: (input) => service.createDraft(input, { rename: true }),
      },
      converters,
      ...(context.variant ? { variant: context.variant } : {}),
    })

    return {
      generate: async (request) => {
        if (request.mode === 'replace') throw new Error('This example does not support regeneration')
        const meta = service.getVariantMetadataEnabled(
          undefined,
          request.meta !== undefined ? { meta: request.meta } : undefined,
        )
        const generated = await generator.generateAll({
          ...request,
          ...(meta !== undefined ? { meta } : {}),
        })

        try {
          if (!this.records.has(request.attachment.id)) throw new Error('Original no longer exists')
          const keys = new Set(this.variantKeys.get(request.attachment.id))
          const records = new Map(this.records)
          for (const { key, attachment } of generated) {
            if (keys.has(key) || records.has(attachment.id)) throw new Error('Variant already exists')
            keys.add(key)
            records.set(attachment.id, structuredClone(toPersistedAttachment(attachment)))
          }
          // No await between validation and publication: this in-process update is atomic.
          this.records = records
          this.variantKeys.set(request.attachment.id, keys)
        } catch (error) {
          const cleanup = await Promise.allSettled(
            generated.map(({ attachment }) => service.remove(attachment)),
          )
          const failures = cleanup.flatMap((result) => result.status === 'rejected' ? [result.reason] : [])
          if (failures.length) throw new AggregateError([error, ...failures], 'Publication and cleanup failed')
          throw error
        }

        // Records already exist. A scheduling failure must not delete their files.
        if (service.getMetadataMode(undefined, meta !== undefined ? { meta } : undefined) === 'deferred') {
          for (const { attachment } of generated) await service.scheduleMetadataExtraction(attachment)
        }
      },
    }
  }
}
```

Select `ProcessingExampleStore.fromApp` in `config/attachment.ts` to use the extended class.
Enable `media.metadataPolicy.mode: 'deferred'` only after selecting a store with a
`metadataPersister`. Register a named converter before scheduling its key:

```ts [config/processing_attachment.ts]
import { defineConfig, LocalFileStorage } from '@jrmc/adonis-attachment'
import ProcessingExampleStore from '../app/attachments/processing_example_store.js'

export default defineConfig({
  storage: LocalFileStorage.fromApp,
  store: ProcessingExampleStore.fromApp,
  converters: { thumbnail: { resize: 320, format: 'webp' } },
  media: { metadataPolicy: { mode: 'deferred', variants: false } },
  queue: { driver: 'memory', onFailure: (_job, error) => console.error(error) },
})
```

This is an alternative configuration for the same `config/attachment.ts`, not a second
configuration file to register. Pass an image's validated bytes, original name and MIME
type to `saveExampleFile()` for this thumbnail converter. Install its optional image
processing dependencies; see [variant requirements](/guide/variants#autodetection).

After the original record commits, schedule work through the full service:

```ts [app/attachments/schedule_example_processing.ts]
import type { ApplicationService } from '@adonisjs/core/types'
import type { Attachment } from '@jrmc/adonis-attachment'

export async function scheduleExampleProcessing(app: ApplicationService, attachment: Attachment) {
  const service = await app.container.make('jrmc.attachment')
  await service.scheduleVariantGeneration(attachment, ['thumbnail'])
  await service.scheduleMetadataExtraction(attachment)
}
```

Keep scheduling outside the database-error cleanup catch. Outside Lucid, setting
`variants` or `meta` on a draft does not replace post-commit scheduling of deferred jobs.
Use a durable outbox if record commit and enqueue must survive a process crash.

## 5. Replace the in-memory records with your ORM

Keep the public `AttachmentStore` contract and the factory. Replace these application operations:

| Example operation | Database-backed implementation |
| --- | --- |
| `records.get(id)` | Fetch and map an original or variant to a plain `Attachment`; return `null` when absent. |
| `insertOriginal()` | Insert all attachment fields and owner links as needed, then confirm commit. |
| Metadata update | Update the current record, preserving your application's concurrency policy. |
| Variant publication | Lock/revalidate the original and identity, enforce uniqueness on original/key, publish generated rows transactionally. |
| Regeneration | Replace rows when `request.mode === 'replace'`; delete superseded files only after commit and when unreferenced. |

The map example has no uncertain database commit outcome. For a real database, only delete
new files after confirmed rollback. An uncertain commit needs reconciliation. Retain failed
post-commit cleanup for retry. Filesystem writes and database commits are separate operations.

For contextual jobs, implement `repository.findByReference()` as well as `findById()`.
Resolve only registered owner types/fields, validate identity again inside publication,
and never fall back to a bare-ID read for an unknown reference.
See [contextual identity](/guide/custom-persistence#contextual-identity-and-worker-resolution).

If you want the shared lifecycle to orchestrate your original/owner writes, expose the
optional `persistence: AttachmentPersistence` capability. Implement the complete transaction
contract (`transaction`, `isScoped`, `afterCommit`, `afterRollback`) for transactional adapters.
Supplying this property does not create ORM decorators or model hooks; wire
`AttachmentLifecycleService` into your application explicitly.
See [shared lifecycle contracts](/guide/custom-persistence#shared-lifecycle-contracts).

## 6. Use the same store in workers

Once your adapter uses shared persistent data, an external forwarding job can use:

```ts [app/attachments/process_attachment_job.ts]
import app from '@adonisjs/core/services/app'
import { createAttachmentProcessor, type AttachmentJob } from '@jrmc/adonis-attachment'

const processor = createAttachmentProcessor(app)

export async function processAttachmentJob(job: AttachmentJob) {
  await processor.process(job)
}
```

Both the memory processor and this worker use `config/attachment.ts`'s store. The external
queue adapter only transports jobs: forward the complete payload, including references.
The web process and worker must share database and file access. The in-memory example
cannot be used across those processes.

## Verify your adapter

Check original and variant reads, missing IDs, metadata updates, publication rollback,
regeneration and cleanup after commit. Test an original replaced while generation is
running, supported contextual references, and a fresh worker process against the same data.
Use your ORM's test database. The package's contract tests do not validate your adapter's SQL.

**Next:** [Persistence workflows](/guide/custom-persistence) · [Background processing](/guide/queues).
