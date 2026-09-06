# Migrate from v5

v6 is a **breaking release**. The biggest change: attachments are no longer stored as
nested JSON inside the parent model. They live in dedicated tables - a blob
table and a polymorphic link table - which unlocks collections, variants, and blob reuse.

::: warning Plan for a data migration
Existing v5 JSON values must be converted into the new rows. The package gives you the
tools; the record-by-record mapping is yours, because only your app knows which model,
column, and owner each value belongs to.
:::

## Migration checklist

1. **Create the new schema.**

   ```sh
   node ace make:attachments-table
   node ace migration:run
   ```

   The stub delegates the blob and link definitions to `AttachmentSchemaService`.

2. **Generate a data-migration script.**

   ```sh
   node ace make:attachment-v5-migration
   ```

   This renders a script into `database/scripts`. Use `--disk=s3` or
   `--folder=...` to change defaults.

3. **Fill in the mapping.** In the generated script, implement `legacyAttachmentRecords`
   so it yields each legacy JSON value together with its `{ type, id, field }` owner.

4. **Test on a staging copy** of the database, check the output, then run in production.
   This is a real write operation: there is no built-in dry-run flag.

5. **Ship the reading code** (models using the new persistence) **before** dropping the old
   JSON columns.

The script uses `migrateLegacyAttachmentRecords`, which writes blob and link rows in
batches (a threshold of 100 blob rows by default, including variants; a complete source
record can take a batch above that threshold). It preserves file paths, disk names, metadata,
variant blurhashes, and the relationship between an original and its variants. It does not
move files in storage; only database rows change.

For a v5 collection, yield its JSON array as a single record. Serialized JSON arrays are
also accepted. Each original receives a collection link with a null `owner_key` and its
zero-based position; each original's variants remain attached to that original.

```ts
yield {
  owner: { type: 'users', id: String(user.id), field: 'gallery' },
  kind: 'many',
  value: user.gallery,
}
```

To yield collection items individually, supply `kind: 'many'` and `position` on every
record. Object values default to singular relations; arrays default to collections.
Empty arrays are skipped. The migration counters count originals and variants separately.

The v5 `meta` object is copied unchanged to the v6 `metadata` column for both originals and
variants. Newly uploaded files use the same default EXIF, video, and PDF metadata profile
whenever `meta: true` is enabled; no extractor configuration is required.

## Map and run the generated script

Read legacy columns with the database query builder, not the new relation accessors.
For example, replace `legacyAttachmentRecords` in the generated script with this iterator
and add the `db` import. This example assumes a numeric `users.id` and legacy JSON columns
named `avatar` and `gallery`; adapt those names and pagination to your schema.

```ts
import db from '@adonisjs/lucid/services/db'

async function* legacyAttachmentRecords(): AsyncGenerator<LegacyAttachmentMigrationRecord> {
  let afterId: number | undefined
  while (true) {
    const query = db.from('users').select('id', 'avatar', 'gallery').orderBy('id').limit(100)
    if (afterId !== undefined) query.where('id', '>', afterId)
    const users = await query
    if (users.length === 0) break

    for (const user of users) {
      yield {
        owner: { type: 'users', id: String(user.id), field: 'avatar' },
        kind: 'one',
        value: user.avatar,
      }
      yield {
        owner: { type: 'users', id: String(user.id), field: 'gallery' },
        kind: 'many',
        value: user.gallery,
      }
    }
    afterId = users[users.length - 1].id
  }
}
```

The owner's `type` must match the new model's table, or the decorator's explicit `type`.
The `field` is the TypeScript property name. Verify that every migrated `disk` is available
in the new storage adapter and that its paths still resolve to the same files.

Run the script from an Ace command so Adonis boots its providers and database connection:

```sh
node ace make:command migrate_attachments
```

Replace the generated command implementation with:

```ts
// commands/migrate_attachments.ts
import { BaseCommand } from '@adonisjs/core/ace'

export default class MigrateAttachments extends BaseCommand {
  static commandName = 'attachments:migrate-v5'
  static options = { startApp: true }

  async run() {
    // Replace the timestamp with the generated script's actual filename.
    const { default: migrateAttachments } = await import(
      '../database/scripts/1700000000000_migrate_v5_attachments.js'
    )
    await migrateAttachments()
  }
}
```

```sh
node ace attachments:migrate-v5
```

New scripts export an async function and do not execute on import. For an older generated
script, change `async function main()` to `export default async function migrateAttachments()`
and remove `void main()` before using this command. Do not run the data script directly
with Node: it requires a booted Adonis application.

### Verification and recovery

- Back up the database, retain the old JSON columns, and pause attachment writes during
  the final migration and cutover. The helper does not synchronize concurrent uploads.
- Check singular links, collection ordering, variant keys, metadata, and sample file URLs
  before switching the application to the new decorators.
- Each batch commits independently. A later failure does not undo earlier batches.
- The script is **not idempotent**: replaying rows can duplicate collection links or hit
  singular-link constraints. On staging, restore the pre-migration database snapshot
  before repeating a full run. For production resumption, implement a durable checkpoint
  or migration ledger committed with each batch; an in-memory iterator cursor is not one.
- Do not delete migrated files during database recovery: they are still the original v5 files.

## Update model decorators

Before switching your models, follow the execution procedure below and verify both the
new rows and file access.

`@attachment()` now declares a singular relation instead of a JSON column. Keep the decorator
name, but change the property type and use the relation methods:

```ts
import { attachment, type AttachmentRelation } from '@jrmc/adonis-attachment/lucid'

@attachment()
declare avatar: AttachmentRelation

user.avatar.set(draft)
await user.save()
```

Use `@attachments()` with `AttachmentCollectionRelation` for collections. The explicit
`@attachmentRelation()` and `@attachmentsRelation()` names remain available as aliases.
`serializeAs` no longer applies: relation accessors are not Lucid columns and are not
serialized automatically.
