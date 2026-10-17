# With another data store

To build your adapter class and its `fromApp` factory, start with
[Creating a store](/guide/creating-a-store). This page covers the data lifecycle,
transaction boundaries and lower-level processing contracts.

Lucid is optional. If you use Prisma, Kysely, MikroORM, raw SQL - or no ORM at all - you
can persist attachments yourself. The pattern is always the same:

1. Create a draft.
2. `persist()` it (writes the file, returns the final `Attachment`).
3. Store the fields you care about in your own schema.

```ts
import app from '@adonisjs/core/services/app'
import { attachmentManager } from '@jrmc/adonis-attachment'
const service = await app.container.make('jrmc.attachment')

const attachment = await attachmentManager.createFromBuffer(fileBytes, {
  originalName: 'profile.jpg',
  mimeType: 'image/jpeg',
  folder: `users/${user.id}`,
})

await attachment.persist()

try {
  await database.userMedia.create({
    data: {
      userId: user.id,
      attachmentId: attachment.id,
      disk: attachment.disk,
      path: attachment.path,
      name: attachment.name,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      extname: attachment.extname,
      size: attachment.size,
      metadata: attachment.metadata,
      blurhash: attachment.blurhash,
    },
  })
} catch (error) {
  try {
    await service.remove(attachment)
  } catch (cleanupError) {
    throw new AggregateError([error, cleanupError], 'Database write and file cleanup failed')
  }
  throw error
}
```

Here `database` represents your application's data client, not a package export. Adapt the
ORM calls to your schema. Keep all required `Attachment` fields shown above if you want
to reconstruct attachments for the service, repository, and worker APIs. `metadata` and
`blurhash` are optional; computed URLs are runtime values and should not be persisted.

The cleanup assumes the insert failed without committing. If using a transaction, place
this catch around the entire transaction, not just its insert. If the database reports an
ambiguous commit outcome, reconcile the record before deleting a potentially referenced file.
Filesystem and database writes are not one atomic transaction; a process crash also needs
application-level reconciliation. The package imposes no schema or relationship model.

For replacement, store the new file at a unique path, commit the new reference, then delete
the old file only if nothing references it. Do not overwrite the old path with `rename: false`
before commit. On deletion, commit removal of references before deleting the file, and retain
enough information to retry failed storage cleanup. Shared files and variants require the
same reference checks in your application.

::: tip Reading the file back
Rebuild an `Attachment`-shaped object from your columns and pass it to
`AttachmentService.read(attachment)` to get the bytes.
:::

## Shared lifecycle contracts

The package provides a persistence-independent
`AttachmentLifecycleService`, exported from `@jrmc/adonis-attachment/core` and the package
root. The [legacy integration](/guide/legacy) uses an internal field-bound JSON store;
the modern Lucid integration uses tables only. There is no automatic data migration
or change to existing tables.

`AttachmentPersistence<Entry, Record>` describes the operations consumed by this service.
An `AttachmentRecord` provides `id` and `toAttachment()`; an `AttachmentEntry` additionally
provides `attachmentId`. Adapters can return richer objects without losing their types.
Collection operations and shared-file linking are separate optional capabilities.

Official adapters must also implement the complete `AttachmentTransaction<Store>` contract:

- `transaction(owner, callback)` locks the owner and passes a scoped store, preserving
  an existing outer transaction rather than committing it prematurely.
- `isScoped` identifies that managed scope.
- `afterCommit` defers file deletion and scheduling until the outermost confirmed commit.
- `afterRollback` cleans up newly written files only after confirmed rollback, never after
  an uncertain commit outcome.

The shared service uses these capabilities, not the adapter's class identity. A partial
transaction implementation is rejected. Custom stores without any transaction capability
retain their existing fallback behavior, but do not gain atomicity from this extraction.
The legacy structural `owner.model.$trx` callback fallback remains for those stores;
new adapters should implement the explicit transaction contract instead.

`LucidAttachmentLifecycleService` remains available with its existing model-specific
results and scoped service instances. It delegates to the shared implementation;
`AttachmentFileCleanupError` is the same class through the core and Lucid exports.

JSON decorators, model snapshot synchronization and allowlisted JSON workers are integrated,
with tests for mixed-mode applications. The built-in HTTP route remains table/ID-only;
v5-style automatic attribute serialization is available through the singular
[/legacy facade](/guide/legacy), not the table relation helpers. Simultaneous
legacy v5 writers remain unsupported.

### Contextual identity and worker resolution

`AttachmentReference` is a versioned, serializable locator. It names a registered adapter,
the stable file identity, and optionally a logical owner. For example, this describes a
JSON attachment; it does **not** configure its persistence mapping by itself:

```ts
import type { AttachmentReference } from '@jrmc/adonis-attachment/core'

const reference: AttachmentReference = {
  version: 1,
  adapter: 'json',
  id: 'stable-file-id',
  owner: { type: 'users', id: '42', field: 'avatar' },
}
```

`withAttachmentReference(attachment, reference)` returns a contextual attachment without
mutating the input. The locator's ID must match the attachment ID. `toPersistedAttachment`
omits both `reference` and the runtime `url`; adapters reconstruct locators when reading.

Repositories may implement `findByReference`. `AttachmentRepositoryRegistry` routes explicit
references through its application-supplied `adapters` map, and preserves bare-ID reads
through its `legacy` repository. `resolveAttachment(repository, id, reference?)` checks IDs
and carries the locator onto the resolved attachment. Unknown adapters, malformed locators,
and repositories without reference support fail explicitly; missing records return null.
An explicit reference never falls back to another adapter or a bare-ID search.

The Lucid repository accepts `{ version: 1, adapter: 'tables', id }`, without an owner.
Its default ID-only behavior is unchanged. Lucid table persistence and variant processing
reject other adapters' references, preventing accidental writes to an identically named
table-backed attachment. Registering a read repository alone does not configure its write
or variant processor: those must also understand the selected adapter.

The service's scheduling methods copy `attachment.reference` to the optional `reference`
field of variant and metadata jobs. The worker resolves contextual jobs from current
persistence before processing; a missing/replaced identity is rejected. Contextual metadata
jobs do not trust their embedded file snapshot. Conflicting IDs or locators are rejected.
Jobs without references retain their existing behavior, including legacy metadata snapshots.
Deploy reference-aware workers before producers start enqueueing contextual jobs; older
workers do not understand this field and must not consume these new jobs.

The adapter must validate the owner and identity again **inside its final write transaction**:
a file can be replaced after worker resolution but before a conversion finishes. This lookup
alone does not establish concurrency safety or compatibility with legacy v5 writers.

An owner type is a configured application key, not permission to query arbitrary tables.
Reference payloads accept no model, connection, column, or lock instructions. Each adapter
must resolve owner types/fields through an allowlist. A locator is not an authorization token.
The built-in HTTP route remains ID-only; no contextual URL encoding or new public route is
introduced at this stage.

## Deferred metadata

Metadata extraction does not require Lucid. In deferred mode, another ORM needs three pieces:

1. A store with a `repository` and an `AttachmentMetadataPersister` that updates its record.
2. The common `createAttachmentProcessor(app)` for external workers (memory is wired automatically).
3. A call to `scheduleMetadataExtraction()` after the attachment record commits.

The default in-memory queue is enough for local development and small applications. This
configuration uses it to extract metadata outside the upload operation:

```ts
// config/attachment.ts
import {
  defineConfig,
  LocalFileStorage,
  type AttachmentMetadataPersister,
} from '@jrmc/adonis-attachment'

// Implemented in the repository example below; keep it in an application module.
import { UserMediaRepository } from '#attachments/user_media_repository'

const metadataPersister: AttachmentMetadataPersister = {
  async persistMetadata(attachment, metadata) {
    await database.userMedia.update({
      where: { attachmentId: attachment.id },
      data: { metadata },
    })
  },
}

export default defineConfig({
  storage: LocalFileStorage.fromApp,
  store: { repository: new UserMediaRepository(), metadataPersister },
  media: { metadataPolicy: { mode: 'deferred' } },
})
```

Enable metadata on the draft, persist the attachment record in your ORM, and enqueue extraction
only after the transaction succeeds:

```ts
import app from '@adonisjs/core/services/app'
import { attachmentManager } from '@jrmc/adonis-attachment'
const service = await app.container.make('jrmc.attachment')

const draft = await attachmentManager.createFromBuffer(fileBytes, {
  originalName: 'profile.jpg',
  mimeType: 'image/jpeg',
  meta: true,
})
const attachment = await draft.persist()

try {
  await database.transaction(async (transaction) => {
    await transaction.userMedia.create({
      data: {
        attachmentId: attachment.id,
        disk: attachment.disk,
        path: attachment.path,
        name: attachment.name,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        extname: attachment.extname,
        size: attachment.size,
      },
    })
  })
} catch (error) {
  try {
    await service.remove(attachment)
  } catch (cleanupError) {
    throw new AggregateError([error, cleanupError], 'Transaction and file cleanup failed')
  }
  throw error
}

// Keep scheduling outside the cleanup catch: the record has already committed.
await service.scheduleMetadataExtraction(attachment)
```

The attachment is usable immediately; its `metadata` column is populated when the job finishes.
For a durable production worker, replace the in-memory queue with the
[Adonis Queue adapter](/guide/queues#a-real-worker-with-adonisjsqueue). The same persister and
post-commit scheduling rule apply. If the application also generates variants, route those jobs
through the full `AttachmentJobProcessor` described below instead of
ignoring non-metadata jobs.

## Enabling jobs and the read route

Variant jobs and the built-in `GET /attachments/:id/:name?` route resolve files through an
**`AttachmentRepository`**. Implement it against your data store:

```ts
import type { AttachmentRepository } from '@jrmc/adonis-attachment'

export class UserMediaRepository implements AttachmentRepository {
  async findById(id: string) {
    const media = await database.userMedia.findUnique({ where: { attachmentId: id } })
    if (!media) return null

    return {
      id: media.attachmentId,
      disk: media.disk,
      path: media.path,
      name: media.name,
      originalName: media.originalName,
      mimeType: media.mimeType,
      extname: media.extname,
      size: media.size,
      metadata: media.metadata,
      blurhash: media.blurhash,
    }
  }
}
```

Then pass it through `store` to `defineConfig`. This read-only store enables the public
route, but does not support persisting generated variants:

```ts
export default defineConfig({
  storage: LocalFileStorage.fromApp,
  store: { repository: new UserMediaRepository() },
})
```

Variant **persistence** stays application-owned in this mode - you decide how to record the
generated variants (the Lucid integration is what automates variant rows for you).

## Generating and persisting variants

Provide `store.variants(service, converters, context)` to add variant persistence to the
same store. The package constructs its memory processor from these capabilities; external
workers call `createAttachmentProcessor(app)` from the package root.

This example assumes application modules for `database` and `UserMediaRepository`, a
`userMediaVariant` table holding `originalId`, `variantKey` and all `Attachment` fields,
and a transaction that rolls back all inserts on failure:

```ts
import { defineConfig, LocalFileStorage, VariantGenerationService, type AttachmentStore } from '@jrmc/adonis-attachment'
import { UserMediaRepository } from '#attachments/user_media_repository'
import database from '#services/database'

const store: AttachmentStore = {
  repository: new UserMediaRepository(),
  variants(attachments, converters, context) {
    const generator = new VariantGenerationService({
      attachments, converters, ...(context.variant ? { variant: context.variant } : {}),
    })
    return {
      async generate(request) {
        const generated = await generator.generateAll(request)
        try {
          await database.transaction(async (transaction) => {
            for (const { key, attachment } of generated) {
              await transaction.userMediaVariant.create({
                data: { ...attachment, originalId: request.attachment.id, variantKey: key },
              })
            }
          })
        } catch (error) {
          const cleanup = await Promise.allSettled(generated.map(({ attachment }) => attachments.remove(attachment)))
          const failures = cleanup.flatMap((result) => result.status === 'rejected' ? [result.reason] : [])
          if (failures.length) throw new AggregateError([error, ...failures], 'Variant persistence and cleanup failed')
          throw error
        }
      },
    }
  },
}

export default defineConfig({
  storage: LocalFileStorage.fromApp,
  store,
  converters: { thumbnail: { resize: 320, format: 'webp' } },
})
```

This is an initial-generation example. For retries and regeneration, enforce uniqueness on
`(originalId, variantKey)`, replace rows transactionally, and remove superseded files only
after commit. The low-level generator does not implement your database's replacement policy.
If metadata is deferred, provide `store.metadataPersister` and schedule metadata for the
generated files after their rows commit. Revalidate contextual owner/identity references
inside the final transaction before publishing results.

After committing an original, resolve the full service using
`await app.container.make('jrmc.attachment')`, then call
`await service.scheduleVariantGeneration(attachment, ['thumbnail'])`.
Outside Lucid, `variants` on `createFrom*` does not replace this post-commit scheduling step.
A store's optional `persistence` capability exposes the existing `AttachmentPersistence`
contract for use with `AttachmentLifecycleService`; merely supplying that property does
not wire another ORM's model hooks or create decorators.

An external worker uses the same configuration:

```ts
import app from '@adonisjs/core/services/app'
import { createAttachmentProcessor, type AttachmentJob } from '@jrmc/adonis-attachment'

const processor = createAttachmentProcessor(app)
export async function processAttachmentJob(job: AttachmentJob) {
  await processor.process(job)
}
```

Forward the complete job, including its optional reference. For public variant URLs, the
store repository must resolve variant IDs as well as original IDs.

**Next:** [Serving files](/guide/serving-files) · [Background processing](/guide/queues).
