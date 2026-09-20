# V5 to v6 procedure

## Inventory and choose per field

Record each legacy table, column, primary key type, stored disk/path convention, and whether
the field is singular or multiple. Sample JSON including variants and empty/null values.
Check existing v6 alpha tables before generating anything; do not create duplicates.
Back up database and stored files, and rehearse replacement/deletion against copies.

- Keep singular attachments or collections in their existing JSON columns: use the experimental `/legacy` path
  below. Confirm the installed build exports it. No JSON-to-table migration is required.
- Use default v6 relations, explicit collection positioning or shared blobs: follow the table migration below.
- Mixed models are supported. Select the target per field and exclude retained JSON fields
  from the table migration. Never drop a column still used by `/legacy`.

## Upgrade package, configuration and dependencies

Upgrade the package to the selected v6 release and run its configure hook before changing
models. Verify that a JSON-retention migration can import `/legacy` from the installed build.
Never force an installation past a peer-dependency conflict. Review the package manifest and
lockfile after each installation and stop if unrelated packages changed.

First resolve the effective v5 option for every field. A value configured by the application or
on its decorator takes precedence over the v5 baseline below; do not overwrite that project
choice with a default from this table. Then compare the resulting value with v6 and make an
explicit v6 setting whenever behaviour differs.

| v5 option | v5 baseline | v6 baseline | Migration rule |
| --- | --- | --- | --- |
| `disk` | unset; Adonis Drive resolves its default disk | the configured storage default, then `fs` | Preserve the actual v5 Drive disk and storage adapter; set `defaultDisk` when needed. |
| `folder` | `'uploads'` | no folder | Set `defaults.folder: 'uploads'` unless the field had its own v5 folder. An omitted v5 folder does **not** mean no folder. |
| `rename` | `true` | generated storage name | Equivalent; retain an explicit project or field override, especially `false` or a callback. |
| `preComputeUrl` | `false` | `false` | Equivalent; retain an explicit project or field override. |
| `meta` | `false` | `false` | Equivalent; retain an explicit project or field override and its extractors/policy. |
| `variants` | `[]` | no variants | Equivalent; retain configured variants and their converters. |
| variant folder | `<original folder>/variants/<original name>` | storage root | Configure root `variant.basePath` and converter folders; see the mapping below. |

v6 additionally defaults `normalizeFileName` to `true`; it had no separate v5 option. Preserve
the storage adapter, disk names and paths; do not silently replace Drive with local storage.
Carry executable paths/timeouts into `media.binaries`, and keep `media.metadata` or
`media.metadataPolicy` only when the application uses them.

### Variant folders

V6 replaces v5's global `variant` setting with root `variant.basePath`. It prefixes every
generated variant. A converter `folder` is the subfolder inside that prefix, rather than an
absolute final folder. Both values accept attachment templates such as `:id` or `:name`, or an
async callback receiving `{ attachment }`. Those fields are from the source attachment, not a
Lucid owner, because a table-backed blob can be shared by several owners.

For every migrated v5 converter, set `folder: ':name'` unless its v5 behavior deliberately did
not include the original name. V5 used the original storage name as the variant namespace;
`:name` keeps that value verbatim, including its extension, so variants from distinct originals
remain isolated.

| Effective v5 `variant` configuration | V5 variant folder | v6 migration |
| --- | --- | --- |
| omitted | `<original folder>/variants/<original name>` | Set `variant.basePath` to a callback deriving `<original folder>/variants`; set converter `folder: ':name'`. |
| `{ basePath }` | `<basePath>/<original folder>/<original name>` | Set `variant.basePath` to a callback combining `basePath` and the original folder; set converter `folder: ':name'`. |
| `{ ignoreFolder: true }` | `<original name>` | Set converter `folder: ':name'`. |
| `{ basePath, ignoreFolder: true }` | `<basePath>/<original name>` | Set `variant.basePath: basePath` and converter `folder: ':name'`. |

Existing v5 JSON documents already contain their original and variant paths. Keeping them in
`/legacy` preserves those stored paths; this mapping affects variants generated after cutover.

Install only what the resulting v6 configuration needs: `sharp` for image variants or technical
metadata, `exifreader` for EXIF/GPS, `blurhash` with `sharp` when enabled, `@adonisjs/drive` for
Drive storage and `@adonisjs/queue` for an external queue. A video, PDF or Office configuration
also requires ffmpeg, Poppler or LibreOffice in the deployment runtime; verify those executables
instead of installing them implicitly. Preserve the chosen queue connection, and ensure an
external worker loads the same configuration and forwards jobs to
`createLucidAttachmentProcessor(app)`.

## Keep a singular JSON field with `/legacy`

Keep `users.avatar` nullable JSON and its existing files. Do not run
`make:attachments-table` or the JSON-to-table script for this field. The configure hook
may still be needed when upgrading; preserve existing application configuration.

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { attachment, attachmentManager, type Attachment } from '@jrmc/adonis-attachment/legacy'

export class User extends BaseModel {
  @column({ isPrimary: true }) declare id: number
  @attachment<User>({ folder: (user) => `users/${user.id}`, meta: true })
  declare avatar: Attachment | null
}

export async function replaceAvatar(user: User, validatedImageBytes: Uint8Array) {
  user.avatar = await attachmentManager.createFromBuffer(validatedImageBytes, 'avatar.jpg')
  await user.save()
  return user.serialize()
}
```

The decorator, `Attachment` type and manager all come from `/legacy`, not the root or
`/lucid`. A matching `@column()` inherited from a generated schema base class or mixin is
claimed automatically by the legacy decorator on the concrete model. Keep the physical SQL
column and generated TypeScript field; no `skipColumns` rule is needed. Only specify `columnName`
when the physical column differs from Lucid's naming convention. Callbacks receive the model;
legacy `rename` receives `(model, field, originalName)`. Assign a new draft or null directly,
not through `fill`/`merge`, and save the owner. Persisted attachments cannot be shared by
assignment to another field because JSON has no global file reference counts.

In `config/attachment.ts`, register
`integrations: { legacy: { models: { users: () => import('#models/user') } } }`.
The key matches logical owner `type` (model table by default), enabling jobs to reload
the current JSON. It creates no tables and is not a global storage-mode switch. Keep
Lucid enabled; `integrations.lucid.jsonModels` has been removed. No `/lucid` decorator
accepts `persistence: 'json'` and `AttachmentRelation<'json'>` is not a supported type.

Variants and deferred metadata use v6 converters/media settings and support both memory
and external queues. Existing external jobs forward their complete `AttachmentJob` to
`createLucidAttachmentProcessor(app)` from `/lucid`; the same registry must be available
in the worker. Memory is the non-durable default, without automatic retry. The shared
`AttachmentRegenerator` supports registered legacy fields via `.row()` / `.model()`;
there is no legacy `avatar.regenerateVariants()` method.

`getUrl()`, `getVariant()`, original/variant `meta` edits followed by owner save, and
automatic serialization are supported. Getters use loaded JSON, so refresh after jobs
finish (save pending edits first) or fetch a new model. Metadata merges independent keys
under an owner-row lock; conflicting edits raise `AttachmentMetadataConflictError` from
`/legacy`. Fetch fresh state and reconcile rather than blindly replaying a stale save.
The implementation does not rely on `JSON_SET` or an additional lock table/library.

Stop v5 writers AND workers before cutover. Retain file and database backups: old JSON is
read in place and IDs may be backfilled on mutation; full downgrade compatibility after
new writes is not promised. Audit shared historical file paths before cleanup tests.
Check serialization/transformers: `serializeAs` is supported, but old `keyId`/`getKeyId()`,
`router.attachments()`, manual variant insertion/deletion and all v5 overloads are not.
The built-in blob-ID route cannot resolve JSON fields; use storage URLs or an authorized
owner-based route and disable the built-in route with `route: false` for JSON-only apps.

## Keep a JSON collection

Use `/legacy` `@attachments()` with `Attachment[] | null`, without `@column()`. Keep the
existing array column and files; do not include it in the table migration iterator.
Append validated files using
`user.gallery = [...(user.gallery ?? []), ...await attachmentManager.createFromFiles(files)]`
and save. Native `push`, removal via `filter`/`splice`, and reassignment are supported.
Retained items keep their order; new drafts append. Reordering, duplicates and foreign
persisted items are rejected. Do not introduce relation `move()`/`addMany()` calls.

Array edits merge membership changes against the loaded snapshot. Concurrent additions
survive, and concurrently removed items are not resurrected. `[]` removes loaded items;
`null` explicitly clears the current field. Test this distinction during cutover.
Custom `serialize` applies per attachment, like v5. Variants, blurhash and original/variant
`meta` edits use the same processing registry and save lifecycle as singular fields.
Regenerate with `AttachmentRegenerator.row/model` selecting `gallery`, then refresh after jobs.

## Migrate selected fields to tables: target schema

After explicitly installing the chosen v6 release, run the configure hook, preserving
application configuration. Generate the target schema and mapping script:

```sh
node ace configure @jrmc/adonis-attachment
node ace make:attachments-table
node ace migration:run
node ace make:attachment-v5-migration
```

Run schema/data commands only in the approved environment. `integrations.lucid.tableName`
controls the blob name; its singular form plus `_links` controls the links. The schema stub
uses `AttachmentSchemaService`, not a hand-maintained copy of the table definitions.

The generated data script lives in `database/scripts/<timestamp>_migrate_v5_attachments.ts`.
`--disk=s3` sets its fallback disk; `--folder=...` changes the script destination, not file
storage paths. Verify that existing disk names resolve in the new storage backend.

## Map legacy records

Replace the generated iterator, retaining the script's exported async function and writer.
This complete iterator example assumes numeric `users.id` and that BOTH JSON `avatar`
and `gallery` were selected for table migration. Omit any fields retained through `/legacy`:

```ts
import db from '@adonisjs/lucid/services/db'
import type { LegacyAttachmentMigrationRecord } from '@jrmc/adonis-attachment/lucid'

export async function* legacyAttachmentRecords(): AsyncGenerator<LegacyAttachmentMigrationRecord> {
  let cursor: number | undefined
  while (true) {
    const query = db.from('users').select('id', 'avatar', 'gallery').orderBy('id').limit(100)
    if (cursor !== undefined) query.where('id', '>', cursor)
    const rows = await query
    if (!rows.length) break
    for (const row of rows) {
      yield { owner: { type: 'users', id: String(row.id), field: 'avatar' }, kind: 'one', value: row.avatar }
      yield { owner: { type: 'users', id: String(row.id), field: 'gallery' }, kind: 'many', value: row.gallery }
    }
    cursor = rows[rows.length - 1].id
  }
}
```

Adapt pagination for other primary keys. Owner `type` must match the new model's table
or explicit decorator `type`; `field` is the model property. Singular values may be objects
or serialized JSON. Collections may be arrays or serialized arrays, preserving order; when
yielding individual collection items, set `kind: 'many'` and `position` on every item.
Empty/null values are skipped. A collection's `owner_key` is null; positions are zero-based.

`migrateLegacyAttachmentRecords` converts values to `{ blobs, links }` and calls the writer.
The generated writer inserts both inside a transaction with `AttachmentModel` and
`AttachmentLinkModel`. Its default batch threshold is 100 blob rows including variants;
a complete source record may exceed it. V5 `meta` is copied into v6 `metadata` unchanged.
Original/variant counters are separate. Files are not moved or deleted by this migration.

## Execute inside Adonis

Generate an application Ace command with `node ace make:command migrate_attachments`.
Set `static commandName = 'attachments:migrate-v5'` and
`static options = { startApp: true }`. In `run()`, dynamically import the actual generated
script and await its default export. Dynamic import keeps database service loading after boot.
Run `node ace attachments:migrate-v5`; do not execute the data script directly with Node.

Older generated scripts with `void main()` must instead export their async main function
and stop executing on import before using this pattern. There is no built-in dry-run flag:
a rehearsal writes real rows to the staging database.

On failure, committed earlier batches remain. Restore the pre-migration staging snapshot
before a full rehearsal replay. Production resumption requires a durable ledger/checkpoint
committed with the data; the example's iterator cursor is not durable. Replaying can duplicate
collection links or violate singular uniqueness. Do not delete originals during recovery.

## Adapt application code for table relations

| V5 | V6 table-backed `/lucid` |
| --- | --- |
| JSON column decorated as attachment | `/lucid` relation decorator; no attachment JSON column |
| `Attachment` or array property | `AttachmentRelation` / `AttachmentCollectionRelation` |
| `user.avatar = await createFromFile(...)` | `user.avatar.set(draft); await user.save()` |
| Assign null / array | `detach()` / `addMany()` or `replaceAll()`, then owner save |
| Positional filename in source methods | `{ originalName: 'photo.jpg' }` options object |
| Root decorators and old `/types/...` imports | Decorators/types from `/lucid`; file data/services from root |
| Global file options | `defaults`, overridden by decorator then manager call |
| `serializeAs`, automatic attachment JSON | Explicit application response/view data |
| `avatar.getUrl()` / `getVariant()` | Read link/blob; use `attachmentService` / relation `variants()` |
| `router.attachments()` | Built-in public blob route, or authorized custom route with `route: false` |
| V5 queue callbacks | Memory `onFailure`, or named connections and external job processor |
| `RegenerateService` | `/lucid` `AttachmentRegenerator` or relation `regenerateVariants()` |

Drive is optional; local filesystem is now the default. Preserve Drive configuration if
legacy disk/path values depend on it. Converter config retains named lazy loaders, but v6
handlers receive `{ attachment, body, options }` and return bytes with filename/MIME rather
than v5's bare input. Shared binaries belong in `media.binaries`.

Verify uploaded originals and variants, metadata/GPS/blurhash, collection order and link IDs,
URLs and private-file authorization, and queue processing before enabling new writes.
Pause legacy writes during final cutover or implement explicit reconciliation. Retain old
JSON until verification; do not drop it as an automatic side effect of changing decorators.
