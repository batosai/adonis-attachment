# V5 to v6 procedure

## Inventory and target schema

Record each legacy table, column, primary key type, stored disk/path convention, and whether
the field is singular or multiple. Sample JSON including variants and empty/null values.
Check existing v6 alpha tables before generating anything; do not create duplicates.

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
This complete iterator example assumes numeric `users.id` and JSON `avatar` / `gallery`:

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

## Adapt application code

| V5 | V6 |
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
