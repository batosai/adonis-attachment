# JSON column persistence (experimental)

For a v5-style singular field with direct assignment and mutable `meta`, start with
[Legacy JSON fields](/guide/legacy). This page documents the lower-level JSON engine
and the earlier experimental relation API, which remains on the branch for evaluation.

On `feat/json-persistence`, each Lucid attachment field can use either the existing
two-table store (the default) or a JSON column on its owner. JSON-only applications do
not need attachment/link tables or a lock dependency. Existing table declarations keep
their behavior and model return types; there is no automatic data migration.

## Choose persistence per model field

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import {
  attachment, attachments,
  type AttachmentRelation, type AttachmentCollectionRelation,
} from '@jrmc/adonis-attachment/lucid'

export default class User extends BaseModel {
  static table = 'users'

  @column({ isPrimary: true })
  declare id: number

  @attachment<User>({ persistence: 'json',
    folder: ({ model }) => `users/${model!.id}`, preComputeUrl: true })
  declare avatar: AttachmentRelation<'json'>

  @attachments({ persistence: 'json' })
  declare gallery: AttachmentCollectionRelation<'json'>

  // Optional: a table-backed field on the same model.
  @attachment()
  declare document: AttachmentRelation
}
```

Create the owner columns in your migration: a nullable JSON object for `avatar`, a JSON
array for `gallery` (`NULL` also means empty). On Oracle use CLOB. Column names are inferred
using the model's naming strategy: `avatar` and `gallery` need no explicit mapping here.
Primary-key column mappings and model connections are respected. The optional `document`
field above still needs the two attachment tables.

<details>
<summary>Optional: override the inferred JSON column name</summary>

Use `columnName` when the existing SQL column differs from the inferred name. For example,
this alternative declaration exposes `user.profilePicture` while storing JSON in `users.avatar`:

```ts
@attachment({ persistence: 'json', columnName: 'avatar' })
declare profilePicture: AttachmentRelation<'json'>
```

It replaces the `avatar` declaration above; do not declare two fields managing the same column.
This option is only available for JSON persistence.

</details>

Use the same staged API in both modes:

```ts
user.avatar.set(draft)
user.gallery.addMany(galleryDrafts)
await user.save()

const entry = await user.avatar.get()
const file = entry?.toAttachment()
await user.avatar.regenerateVariants(['thumbnail'])
```

New owners are inserted before pending attachments are persisted, within the same
transaction. `relation.persist()` also works for an already persisted owner.
`user.delete()` purges JSON and table fields transactionally; physical files are deleted
only after commit. Bulk query-builder deletes bypass these model hooks.

**Do not add `@column()` on the managed JSON field, or another attribute mapped to the
same database column.** The relation is a persistence boundary, not a freely assignable
JSON attribute. Lucid leaves its raw loaded value in `$extras`; relation reads and writes
refresh that snapshot, and rollback restores it. It is not part of `$attributes`/`$dirty`,
so a later `save()` of an old model cannot overwrite a worker's JSON updates. Other
instances are not live caches: call `get()`, `all()` or `variants()` to read current data.
Use `toAttachment()` explicitly in your response/transformer; this is not automatic
v5-style JSON attribute serialization.

## Configure automatic workers

Register trusted lazy model imports in `config/attachment.ts`:

```ts
export default defineConfig({
  storage: AdonisDriveStorage.fromApp,
  route: false,
  integrations: {
    lucid: {
      jsonModels: { users: () => import('#models/user') },
    },
  },
  // Keep your existing converters, metadata policy and queue configuration.
})
```

`defineConfig` and `AdonisDriveStorage` come from `@jrmc/adonis-attachment`.
Registry keys must match the relation's logical `type` (the model table by default).
The registry loads models lazily, including in a fresh external worker; it does not
depend on a previous HTTP request having loaded them. Only declared JSON fields on
allowlisted models can be resolved. Jobs carry logical owner/type/field/ID references,
not SQL table or column names. These references are locators, **not authorization tokens**.

The default memory processor and `createLucidAttachmentProcessor(app)` now route JSON
variant jobs automatically. The default deferred metadata persister dispatches to JSON
or tables. Explicit custom repositories, processors and metadata persisters still take
precedence and must implement the modes they use. For manually constructed workers,
`LucidJsonAttachmentRegistry` and the processor's `jsonPersistence` option are available.

JSON variant conversion runs outside the row lock. Publication revalidates the original
under lock, writes the whole generated batch transactionally, cleans generated files on
confirmed rollback and deletes replaced files after commit. Generated variants use unique
names even if original-upload defaults use `rename: false`. Stale original/variant jobs
fail rather than updating a replacement. Regeneration replaces variants with new IDs.

The built-in ID-only HTTP route still serves table-backed attachments only. Use a route
you authorize and implement yourself, or Drive URLs (`preComputeUrl`, `getUrl`, signed
URLs). Set `route: false` for JSON-only applications; keep Lucid integration enabled for
the automatic worker configuration above. Dynamic per-request tenant connections are
not encoded in references: workers use the registered model's configured connection.

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
  variants: [], // This standalone mapping is not registered with a worker.
  meta: false,
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
creation/deletion effects. The standard JSON worker handles generated-file effects when
using the model registry described above.

The lifecycle carries JSON references onto jobs after persistence. A standalone mapping
without a registered decorated model needs its own reference repository and JSON-aware
processors. A single field-bound store can serve its own repository and metadata writes;
do not send these jobs directly to a tables-only processor.

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

The decorator binds its model to the store for snapshot synchronization and folder/rename
callbacks. An explicit low-level store rejects an unbound `owner.model`; use a plain owner
with that API. If your application maps the same column as an ordinary Lucid attribute,
do not save a stale value over store writes. Every writer must follow the locking protocol.

### Concurrent metadata edits (store API)

`patchMetadata(attachment, before, after)` applies the differences between two metadata
snapshots to the current document, re-read under the owner lock. Keep `before` unchanged:

```ts
const entry = await store.findOriginal(owner)
if (!entry) throw new Error('Avatar not found')

const file = entry.toAttachment()
const before = structuredClone(file.metadata)
const after = structuredClone(before ?? {})
after.caption = 'Profile photo'

const updated = await store.patchMetadata(file, before, after)
```

If a worker added `width` or a variant after this read, those changes are preserved.
The returned attachment contains the merged metadata; it does not mutate the caller's
snapshots. The method captures both snapshots before waiting for a transaction or lock.
The [legacy facade](/guide/legacy) uses this mechanism to track in-place mutations such
as `user.avatar.meta.caption = ...` and variant metadata changes when the model is saved.

- Different object keys, including nested keys, merge independently. Keys containing
  dots or slashes are literal keys, not SQL/JSON paths.
- Removed keys are deleted. Values follow JSON serialization rules: an object property
  set to `undefined` is omitted; `null` remains a value. Arrays are replaced as whole
  values rather than merged by index.
- Incompatible edits to the same key, or a concurrently removed/replaced parent object,
  raise `AttachmentMetadataConflictError` (`E_ATTACHMENT_METADATA_CONFLICT`, HTTP 409).
  Its `path` is an array of key names; `[]` denotes the whole metadata object. Reload and
  reconcile before retrying. The entire patch fails without partially writing other keys.
- Identical concurrent writes are accepted. These are value assignments, not atomic
  increments: two callers changing a counter from 0 to 1 do not produce 2.
- Passing `undefined` as `after` removes the whole `meta` object, provided no conflicting
  metadata edit occurred. Passing `{}` removes only keys present in `before`, preserving
  independent keys added concurrently. An unchanged patch does not rewrite the JSON or add legacy IDs.
- Original and variant identities and file locations are checked inside the transaction;
  a stale edit cannot modify a replacement file. Outer transactions are preserved.

The JSON store's `persistMetadata(attachment, metadata)` now uses the same merge mechanism,
taking `attachment.metadata` as the **unmodified before snapshot**. This also protects
worker extraction against unrelated metadata edits made while extraction is running.
It is no longer a blind replacement of the whole stored `meta` object. This behavior
applies to the JSON adapter; the table-backed metadata persister is unchanged.

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

The database matrix includes nine JSON scenarios alongside the existing table-backed
scenarios. Server-engine concurrency tests use up to eight connections; the JSON SQLite-family
tests currently use one connection and do not establish multi-process contention behavior.
Model-level scenarios cover the singular legacy facade, worker variants/metadata, stale-model saves and mixed-mode
creation/deletion rollback. Two more exercise concurrent metadata patches, preservation
of variants/nested keys, and metadata conflict/rollback behavior. Separate local tests cover v5 document validation, lifecycle
rollback/retry, allowlisted job routing, default memory workers, ambiguous commit handling,
post-commit cleanup failures and same-name file protection. Network outages, process crashes, other server
versions and alternative isolation levels are not certified by these tests.
