# Storing with Lucid

The Lucid integration is optional, but it's the most convenient way to tie files to your
records. Attachments are represented by polymorphic relations backed by the package tables.

It also exports `createLucidAttachmentProcessor` for external queue workers. The default
in-memory queue creates this processor automatically; see
[Background processing](/guide/queues#creating-the-lucid-processor-for-a-worker).

Use `@attachment()` for one file and `@attachments()` for an ordered collection.
`@attachmentRelation()` and `@attachmentsRelation()` remain available as equivalent,
explicit names.

## Set up the tables

```sh
node ace make:attachments-table
node ace migration:run
```

This creates two tables (see [Core concepts](/guide/concepts#the-blob-vs-link-split-lucid)):

- **`adonis_attachments`** - the blobs (file data). Holds originals *and* variants
  (`parent_id` / `variant_key`).
- **`adonis_attachment_links`** - the polymorphic links (`attachable_type`, `attachable_id`,
  `field`, `owner_key`, `position`, `attachment_id`).

Referenced blobs are protected by a restrictive foreign key. Delete links through the
relation API before deleting an unreferenced blob; deleting a blob directly must not erase
another owner's links. Only original blobs can be reused with `attachExisting`/`addExisting`.

### Upgrade an existing v6 schema

Older v6 tables used cascading deletion for `attachment_id`. Add a migration to replace
that foreign key, preserving both tables and their data:

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'
import { AttachmentSchemaService } from '@jrmc/adonis-attachment/lucid'

export default class extends BaseSchema {
  async up() {
    await new AttachmentSchemaService(this.db.getWriteClient()).protectReferencedBlobs()
  }

  async down() {
    await new AttachmentSchemaService(this.db.getWriteClient()).restoreCascadingBlobDeletion()
  }
}
```

For custom table names, pass `{ tableName: 'media_attachments' }` as the second constructor
argument. Fresh installations already use the protected foreign key. No lock table or
additional dependency is needed.

## Single attachment - `@attachment`

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { attachment, type AttachmentRelation } from '@jrmc/adonis-attachment/lucid'

export default class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @attachment({
    folder: ({ model }) => `users/${model?.id}/avatar`,
    rename: false,
  })
  declare avatar: AttachmentRelation
}
```

`avatar` is a relation accessor, not a column. Its **mutations are staged** and applied
when you `save()` the model (or when you call `await avatar.persist()`). Reads stay async.

| Method | Does |
| --- | --- |
| `get()` | Reads the linked `AttachmentLinkModel` (blob preloaded) or `null`. Async. |
| `attach(draft)` | Stages the first attachment. Throws on flush if one already exists. |
| `set(draft)` / `replace(draft)` | Stages an attachment, or a replacement of the current one. |
| `attachExisting(id)` | Stages a link to an **existing blob** (reuse, no new file). |
| `detach()` | Stages removal of the original, its variants, and their files. |
| `persist()` | Flushes the staged mutation now and returns the link (or `null` after detach). Async. |
| `variants()` | Reads the persisted variants of the current original. Async. |
| `regenerateVariants(keys?)` | Enqueues replacement generation. Existing variants with the same key are updated; returns `false` if nothing is attached. |

```ts
const draft = await attachmentManager.createFromFile(request.file('avatar')!)

user.avatar.set(draft) // stage the change
await user.save()      // flush: file written, blob + link rows created

// Read it back, then stage a removal
const link = await user.avatar.get()
user.avatar.detach()
await user.save()
```

::: info Staged, then flushed
Relation mutations are staged on the model and applied only after `save()` succeeds - so
you can even stage an attachment before the record exists, and it is written once the
insert completes. To flush without a full `save()`, call `await user.avatar.persist()`;
that path does require an already persisted owner. A failure before commit rolls back the
model and attachment rows, cleans up new files, and retains staged mutations for retry.
An `AttachmentPostCommitError` instead means the database changes have already committed;
do not replay the mutation or delete its newly referenced files.
:::

### Custom polymorphic type

The link's `attachable_type` defaults to the model's `static table`. Pin a stable value if
you rename tables:

```ts
@attachment({ type: 'user' })
declare avatar: AttachmentRelation
```

### Paths from model attributes

String `folder` and custom `rename` values support V5-style `:attribute` parameters. The
value is read from the model, then lowercased and slugified before insertion. Only string
attributes are substituted; an unknown or non-string parameter stays unchanged.

```ts
@attachment({
  folder: 'uploads/:name/avatars',
  rename: () => ':name-avatar.jpg',
})
declare avatar: AttachmentRelation
```

For `name = 'Jane Doe'`, this writes to
`uploads/jane-doe/avatars/jane-doe-avatar.jpg`. Attachments are staged until after the owner
is saved. For a numeric auto-increment ID, use a callback instead: string interpolation
parameters do not substitute numbers.

```ts
@attachment({ folder: ({ model }) => `users/${model?.id}/avatars` })
declare avatar: AttachmentRelation
```

### Public URLs

Enable `preComputeUrl` to resolve a public URL when `get()`, `all()`, or `variants()` reads
the relation. The URL is kept in memory on the loaded attachment model and is never stored:

```ts
@attachment({ preComputeUrl: true })
declare avatar: AttachmentRelation

const link = await user.avatar.get()
const url = link?.attachment.url
```

The configured storage must provide a public URL, such as Adonis Drive or
`LocalFileStorage` with `baseUrl`. Signed URLs are always generated explicitly through
`attachmentService.getSignedUrl()` because they expire.

## Many attachments - `@attachments`

An **ordered** collection. Each item is a link row with a `position` and a `null`
`owner_key`.

```ts
import { attachments, type AttachmentCollectionRelation } from '@jrmc/adonis-attachment/lucid'

export default class Post extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @attachments({
    folder: ({ model }) => `posts/${model?.id}/gallery`,
  })
  declare gallery: AttachmentCollectionRelation
}
```

Collection mutations are staged the same way, then applied on `save()` (or
`await gallery.persist()`).

| Method | Does |
| --- | --- |
| `all()` | Reads items, ordered by position. Async. |
| `add(draft, position?)` | Stages an append (or insert at `position`). |
| `addMany(drafts, position?)` | Stages several attachments, in input order. |
| `addExisting(id, position?)` | Stages adding an existing blob (reuse). |
| `remove(id)` | Stages removal of one item; positions renormalize on flush. |
| `move(id, position)` | Stages a reorder. |
| `clear()` | Stages removal of all items. |
| `replaceAll(drafts)` | Stages a full swap of the collection. |
| `persist()` | Flushes staged operations now (requires a persisted owner). Async. |
| `regenerateVariants(keys?)` | Enqueues replacement generation for every persisted item. |

```ts
const drafts = await attachmentManager.createFromFiles(request.files('images'))

post.gallery.addMany(drafts)
await post.save()      // flush the collection

// Insert several files at a specific position.
post.gallery.addMany(drafts, 0)
await post.save()

// move takes the persisted link id from all()
const [first] = await post.gallery.all()
post.gallery.move(first.id, 0)
await post.save()
```

The `id` used by `move` and `remove` is the persisted **link id** returned by `all()`,
while `attachmentId` identifies the reusable blob.

## Reusing a blob across records

Because links point to blobs, you can attach the **same file** to several records without
copying it - pass an existing blob id:

```ts
const link = await user.avatar.get()

otherUser.avatar.attachExisting(link!.attachmentId)
await otherUser.save()

post.gallery.addExisting(link!.attachmentId)
await post.save()
```

The blob's file is deleted only when its **last** link is removed. There is no automatic
content-based deduplication - reuse is always explicit.

## Transactions

`save()` with staged attachments, explicit relation `persist()`, and model `delete()` run
transactionally. A failure in a later attachment field also rolls back earlier fields and
the owner write. Existing transactions are joined through savepoints, so catching a failed
operation inside your transaction does not retain its partial SQL writes.

When your model runs inside a Lucid transaction, the staged mutations flushed on `save()`
**join it** automatically:

```ts
await db.transaction(async (trx) => {
  user.useTransaction(trx)
  user.avatar.set(draft)
  await user.save() // staged mutation flushes on the transaction's client
  // if the transaction rolls back, the newly written file is removed too
})
```

- Database rows are written on the transaction's client.
- **New files** written by `attach`/`set`/`add` are removed on **rollback**.
- **File deletions** from `detach`/`replace`/`remove`/`clear` are deferred until
  **commit** - a rollback keeps the previous files intact.

When a replacement would reuse the previous file's storage path (for example with
`rename: false`), its bytes are written to a unique subdirectory. The filename stays the
same; use the returned attachment's `path` or URL. Stage the draft on the relation before
persisting it so the integration can protect the previous file before any write.

Lucid retains draft bytes until persistence succeeds (or until the transaction commits).
After an insertion failure or rollback, cleanup restores the draft to an unpersisted state,
so it can be retried. Staged mutations are restored on rollback; do not append the same
collection inputs a second time to that instance. Reloading the owner clears the need to
reuse its in-memory transaction state; stage inputs on a fresh instance when doing so.

Deleting the owning record triggers an `after('delete')` hook that removes all of its
links (and any blobs that become unreferenced).
Bulk query-builder deletes and raw SQL bypass model hooks; they must arrange owner-link
cleanup explicitly.

### Concurrent mutations

Relation mutations lock the existing owner row before reading and changing attachment
state. PostgreSQL/MySQL use row locks; SQLite reserves its writer with an initial write.
An empty collection is protected too, because its owner already exists. Operations on
different fields of the same owner may wait for each other. Keep transactions short;
file persistence currently happens while the transaction is open.

Standalone `LucidAttachmentStore` and `LucidAttachmentLifecycleService` mutations also
open transactions. Supply `owner.model` for a Lucid owner, or identify an existing row
without requiring a model:

```ts
const owner = {
  type: 'users', id: String(userId), field: 'gallery',
  lock: { table: 'users', column: 'id', value: userId },
}
await store.createCollectionItem(owner, attachment)
// When calling remove directly, supply the same owner descriptor:
await store.remove(link, owner)
```

The lock descriptor is trusted server configuration and must identify the same owner row
for every writer. SQLite also supports owners without a model or lock descriptor by
reserving its database writer. Other engines reject that configuration before mutation:
there is no portable existing row to lock for a completely external, empty collection.
Reads and variant generation do not need an owner descriptor. Lock timeouts, deadlocks,
or serialization errors can still require retrying the surrounding transaction.

### Database integration tests

From the package checkout, run the dedicated server suite with Docker or Podman:

```sh
npm run test:databases
# Or on a machine using Podman:
CONTAINER_RUNTIME=podman npm run test:databases
# All implemented targets, or a specific selection:
CONTAINER_RUNTIME=podman npm run test:databases -- all
CONTAINER_RUNTIME=podman npm run test:databases -- mariadb sqlite3 libsql libsql-server
```

By default, the runner starts disposable PostgreSQL 18.4 and MySQL 8.4 containers, binds random
localhost ports, and removes its containers and anonymous volumes after each run.
Images remain cached. It does not connect to an application's database. Test drivers
are development dependencies, not additional runtime dependencies.

The same 19 tests run on each server: schema creation and foreign-key upgrades,
blob/JSON/BIGINT round trips, collection ordering, concurrent inserts using either an
existing Lucid owner or `owner.lock`, singular uniqueness, shared blobs, concurrent
variant replacement, nested rollback, and effects deferred to the outer transaction.
They also cover timestamp instants, large JSON metadata, atomic original/variant
deletion, explicit table-reference resolution and metadata persistence, and file lifecycle
effects (using an in-memory storage double).
Four scenarios exercise the [explicit JSON store](/guide/json-persistence): legacy reads,
large metadata writes, concurrent collections/singular ownership, nested rollback with
file effects, and rejection of obsolete original/variant identities.
PostgreSQL, MySQL, MariaDB, Oracle, and SQL Server concurrent tests use a pool of up to eight connections.
The SQLite-family matrix uses one connection: its simultaneous calls test transaction
sequencing, not contention between independent clients. The default suite additionally
tests `better-sqlite3` with two workers and separate connections to one file.

Additional targets are `mariadb` (11.4 image), `better-sqlite3`, `sqlite3`, `libsql`
(local `file:` mode, which delegates to `sqlite3`), and `libsql-server` (a real HTTP
server using `ghcr.io/tursodatabase/libsql-server:latest`). The LibSQL server image is
not version-pinned; the suite reports the SQL engine version on each run. It does not
validate Turso's managed service, replicas, or distributed writes.

This suite has passed on PostgreSQL 18.4, MySQL 8.4.11 (InnoDB), and MariaDB 11.4.13,
with their default isolation levels. The default `npm test` suite remains independent of containers and
covers SQLite and the other package features. These targeted server tests do not certify
every feature on every database: other engines, network failures, process crashes,
and alternative isolation levels require separate validation.

SQLite foreign-key enforcement must be enabled on **every connection**, before opening
transactions. The `sqlite3` driver does not enable it by default. The single-connection
test harness runs `PRAGMA foreign_keys = ON`; applications should configure their pool's
`afterCreate` hook (for the callback-based `sqlite3` driver):

```ts
pool: {
  afterCreate(connection, done) {
    connection.run('PRAGMA foreign_keys = ON', (error) => done(error, connection))
  },
},
```

Without foreign-key enforcement, the schema's `RESTRICT` and `CASCADE` protections do
not apply. Verify `PRAGMA foreign_keys` returns `1` on the actual application connection.

SQL Server and Oracle can be tested explicitly after accepting the applicable licenses:

```sh
CONTAINER_RUNTIME=podman npm run test:databases -- mssql oracle
```

These two targets are excluded from `-- all`: selecting `mssql` starts SQL Server
Developer with `ACCEPT_EULA=Y`; selecting `oracle` runs Oracle Database Free under its
license terms. Both use disposable containers, random localhost ports, and test-only
credentials. Oracle gets a dedicated user and tablespace; SQL Server gets a dedicated
test database. The tags are `2022-latest` and `latest-lite`, respectively; actual server
versions are printed during the run.

**Oracle AI Database 26ai Free 23.26.3.0.0 passes the 19 tests.** Its integration uses:

- The default foreign-key delete restriction, omitting the unsupported `RESTRICT`
  keyword. Referenced originals remain protected, and unreferenced variants still cascade.
- A CLOB for metadata, avoiding Knex's Oracle `JSON` mapping to `VARCHAR2(4000)`.
- Native date bindings for the package's two models, independent of session date formats.
- `ROWNUM` predicates for single-row locked reads, avoiding Knex's invalid combination
  of a limited subquery and `FOR UPDATE`.
- Explicit savepoints on the existing Oracle transaction. This avoids the installed
  Knex Oracle nested-transaction finalizer committing the shared connection prematurely.
  Only the outer transaction commits; file effects follow its commit or rollback.

Use nested operations sequentially within one transaction. These adaptations cover
transactions opened by this integration, not arbitrary application calls to nested
Lucid/Knex transactions. Application-owned datetime columns retain their own Lucid
configuration; the package does not change global Oracle session settings.

The Oracle validation uses fresh tables and also tests upgrading the link foreign key.
If you previously worked around the unsupported Oracle schema manually, audit the
existing metadata column and constraints before upgrading: changing an existing
`VARCHAR2` metadata column to CLOB needs a separate migration. Failed Oracle DDL can
leave partial tables behind; do not drop tables containing application data to retry.
Older Oracle versions and custom isolation levels have not been validated.

**SQL Server 2022 Developer 16.0.4275.2 passes the 19 tests.** Its integration uses:

- `ON DELETE NO ACTION` for both foreign keys. The foreign keys remain enforced;
  the self-referencing cascade rejected by SQL Server is not generated.
- Explicit deletion of variants before their original inside the store's transaction.
  Both deletes roll back together, and shared or referenced blobs remain protected.
  Use the store or lifecycle API: a direct SQL/model deletion of an original that still
  has variants is rejected, rather than cascading automatically on this engine.
- Native date bindings for the package's timestamps, preserving instants instead of
  letting local date strings be interpreted as UTC.
- Lowercase UUID consumption for the two package models, including their blob references,
  because the SQL Server driver returns `UNIQUEIDENTIFIER` values in uppercase by default.
  Application owner identifiers and global driver options are not changed.

Existing owner rows still provide the locks; no additional table or lock dependency is
needed. Lucid/Knex's SQL Server row locks and nested transactions pass the concurrent
insertion, variant replacement, nested rollback, and deferred file-effect tests.
Application-owned datetime columns retain their own Lucid configuration.

Validation covers fresh tables and link foreign-key upgrades. If you manually worked
around the previously unsupported SQL Server schema, audit its existing constraints
before upgrading. Other SQL Server versions and custom isolation levels have not been validated.

Redshift is not validated;
in particular, the nested savepoints used by this integration are not supported by
Redshift, so Lucid dialect availability alone does not establish compatibility.

### Failures after commit

File deletion and job scheduling happen after commit. A cleanup failure retains the new
attachment. For transactions managed by the integration, `AttachmentPostCommitError`
exposes individual failures in `errors`; an `AttachmentFileCleanupError` includes the
failed file locations in `attachments`, so callers can retry their removal independently.
Other post-commit callbacks are still attempted after one fails.

`AttachmentCommitError` means the commit outcome could not be confirmed (for example,
the connection failed during commit). Files are retained because SQL may have committed.
Reload database state before retrying the mutation or deciding which files to remove.

When the application supplies the outer Lucid transaction, its commit/rollback hooks own
these effects. Lucid may swallow hook exceptions; do not rely on `trx.commit()` rejecting
to detect storage or queue failures. Report failures in your storage/queue adapters in
that case. Database and filesystem changes are not a distributed transaction: process
crashes and failed cleanup still require application-level reconciliation.

## Regenerate variants

Regeneration generates the requested variants again from each original, then replaces the
existing variant with the same key.

For one relation or one collection, call the accessor directly:

```ts
await user.avatar.regenerateVariants(['thumbnail'])
await post.gallery.regenerateVariants()
```

For maintenance work across a model, use `AttachmentRegenerator`. It fetches the model in
pages and enqueues work with bounded concurrency; it does not perform conversions in the
web request.

```ts
import { AttachmentRegenerator } from '@jrmc/adonis-attachment/lucid'
import User from '#models/user'

const result = await new AttachmentRegenerator()
  .model(User, {
    attributes: ['avatar'],
    variants: ['thumbnail'],
    batchSize: 100,
    concurrency: 5,
  })
  .run()

// { rows: 250, attachments: 250 }
```

Use `.row(user, options).run()` when a single persisted model must be regenerated. The
`attributes` option is validated against the model's declared attachment relations.

## Reading with variants

Load an owner field together with its variants through the store:

```ts
import { LucidAttachmentStore } from '@jrmc/adonis-attachment/lucid'

const found = await new LucidAttachmentStore().findByOwner({
  type: 'users',
  id: user.id,
  field: 'avatar',
})

if (found) {
  found.original.toAttachment()
  found.variants.map((v) => v.toAttachment())
}
```

**Next:** [Serving files](/guide/serving-files) · [Image variants](/guide/variants).
