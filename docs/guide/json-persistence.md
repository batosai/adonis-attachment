# JSON column persistence (experimental)

On `feat/json-persistence`, `LucidJsonAttachmentStore` offers **explicit, field-bound**
JSON persistence using a Lucid query client. It does not need the attachment/link tables
or a lock dependency. The existing tables adapter and decorators remain unchanged.

This is not yet the automatic JSON decorator integration. Owner model synchronization,
per-field decorator selection and automatic JSON variant workers are still pending.
Do not select JSON through an invented `@attachment` option.

## Configure a trusted field mapping

Your application creates its owner table and JSON column. Use a nullable object column
for a singular attachment and an array for collections (`NULL` is accepted as empty).
For the tested Oracle configuration use CLOB, not `VARCHAR2(4000)`.

```ts
import db from '@adonisjs/lucid/services/db'
import { attachmentManager, attachmentService, AttachmentLifecycleService } from '@jrmc/adonis-attachment'
import { LucidJsonAttachmentStore } from '@jrmc/adonis-attachment/lucid'

const owner = { type: 'users', id: '42', field: 'avatar' }
const store = new LucidJsonAttachmentStore({
  client: db.connection(),
  owner,
  table: 'users',
  primaryKey: 'id',
  column: 'avatar',
  kind: 'one',
  defaultDisk: 'fs',
})
const lifecycle = new AttachmentLifecycleService(attachmentService, store)

const draft = await attachmentManager.createFromBuffer(fileBytes, {
  originalName: 'profile.jpg',
  variants: [], // Automatic JSON variant processing is not wired yet.
  meta: false,  // Or configure an explicit JSON-aware metadata processor.
})
const entry = await lifecycle.attach(owner, draft)
const attachment = entry.toAttachment()

await lifecycle.detach(owner)
```

`fileBytes` represents your uploaded bytes. `table`, `primaryKey` and `column` come from
trusted application configuration, never from a job/reference or HTTP parameter. The
store checks that every supplied owner/reference matches its configured logical field.
An owner row must already exist. Only that JSON column is updated; timestamps and other
application fields are not updated automatically.

For an application using only this explicit JSON integration, disable automatic table
integration with `integrations: { lucid: false }` and disable the default ID-only route
with `route: false` in attachment configuration. This does not prevent direct use of the
Lucid JSON store. The built-in route does not yet resolve contextual JSON locators.

## Collections, variants and metadata

For a gallery, bind another store to `field: 'gallery'`, `column: 'gallery'`, `kind: 'many'`.
The shared lifecycle supports `add`, `listCollection`, `moveCollectionItem`,
`removeCollectionItem`, `replaceCollection` and `clearCollection`.
Indices are computed under the owner lock; callers address existing entries by stable ID.
`purgeOwner` on this **field-bound** store purges only the configured field, not every
attachment column on the owner. Explicitly purge each configured field when deleting an owner.

Read results are `JsonAttachmentEntry` / `JsonAttachmentRecord`, not Lucid models.
Use `toAttachment()` for files and URLs. They have no `save()` or model query methods.
`findById` searches only the configured field; `findByReference` validates its JSON owner
context first. Missing owners/files resolve to null through these repository methods.

The store exposes transactional `createVariant`, `replaceVariant`, `listVariants` and
`persistMetadata`. Variant replacement uses a **new file ID** and returns the previous
file for post-commit cleanup. Stale original/variant IDs are rejected inside the final
write transaction. Direct store methods persist data only: callers own generated-file
cleanup and must defer it to commit. The shared lifecycle handles its own attachment
creation/deletion effects, but the automatic variant worker adapter is not implemented yet.

The lifecycle carries JSON references onto jobs after persistence. To consume them, register
a matching reference repository and JSON-aware write processors; do not use the default
tables-only variant or metadata processor. A single field-bound store can serve its own
repository and metadata writes. Application-wide owner dispatch remains to be integrated.

## Transactions and file safety

Mutations start a transaction, lock and re-read the owner row, then write the updated JSON.
SQLite reserves its writer before reading; server engines lock the existing row. Complex
array operations currently rewrite the column under that lock; they do not use `JSON_SET`.
An explicitly supplied outer transaction is preserved, including Oracle savepoints.
Use nested operations sequentially on a transaction client.

Pass an outer transaction as `client` when attachment mutations must participate in it.
Lifecycle file deletion and scheduling wait for its confirmed commit. Rollback retains old
files and cleans up newly created files. Ambiguous commits require reconciliation, not
unconditional file deletion; SQL and file storage are still separate systems.

`releaseOwner` and `restoreOwner` are lifecycle implementation operations, available only
inside a scoped transaction. Replacements must use fresh, never-reused file identities and
distinct staged paths; the package's draft factory generates IDs for this purpose.

Automatic synchronization of an in-memory Lucid owner's JSON attributes is **not implemented**.
Passing `owner.model` is rejected. Do not later save an old loaded JSON value over these writes;
refresh the model or keep mutations on the explicit store until decorator integration exists.
Every writer of these columns must follow the locking protocol.

## Existing v5 data

The reader accepts v5 objects/arrays, serialized JSON or native driver JSON, with `meta` and
`variants`. Missing disk/path/original name use the configured disk and v5 filename fallbacks.
Unknown document fields are preserved when updating existing documents.

Reading does not alter the database. For documents without IDs, deterministic owner/file
identities make repeated reads and collection reordering stable. The next mutation persists
those IDs, including variant IDs, alongside the v5 fields. New files use their draft IDs.
This is v5 **data-reading compatibility with additive IDs**, not a promise of identical v5
APIs, byte-for-byte output or safe concurrent writes by the old v5 package. Legacy writers
can drop IDs or overwrite the entire JSON and must be stopped for these fields.

Duplicate IDs, duplicate variant keys, nested variants, malformed values and duplicate file
locations within the field are rejected. Existing inconsistent data must be reviewed first;
the store does not silently discard it.

Shared files across owners/fields and standalone unattached records are not supported in
this mode. Do not copy a file's location between JSON columns: there is no global reference
count to protect such aliases. Use the tables adapter for shared references.

## Validation scope

The database matrix includes four JSON scenarios alongside the existing table-backed
scenarios. Server-engine concurrency tests use up to eight connections; the JSON SQLite-family
tests currently use one connection and do not establish multi-process contention behavior.
Separate local tests cover v5 document validation, lifecycle rollback/retry, post-commit job
references and same-name file protection. Network outages, process crashes, other server
versions and alternative isolation levels are not certified by these tests.
