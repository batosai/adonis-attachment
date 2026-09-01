# Migrate from v5

v6 is a **breaking release**. The biggest change: attachments are no longer stored as
nested JSON inside the parent model by default. They live in dedicated tables - a blob
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

4. **Dry-run on a staging copy** of the database, check the output, then run in production.

5. **Ship the reading code** (models using the new persistence) **before** dropping the old
   JSON columns.

The script uses `migrateLegacyAttachmentRecords`, which writes blob and link rows in
batches (100 per transaction by default). It preserves file paths, disk names, metadata,
variant blurhashes, and the relationship between an original and its variants. It does not
move files in storage; only database rows change.

The v5 `meta` object is copied unchanged to the v6 `metadata` column for both originals and
variants. Configure `createDefaultMetadataExtractors()` for newly uploaded files when
you want to keep the same EXIF, video, and PDF metadata shape after migration.

## Existing v6 tables

Tables created before blurhash support need a nullable column before variants can persist a
hash. Create a normal Lucid migration and delegate that change to the schema service:

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'
import { AttachmentSchemaService } from '@jrmc/adonis-attachment/lucid'

export default class AddBlurhashToAttachments extends BaseSchema {
  async up() {
    await new AttachmentSchemaService(this.db.getWriteClient()).addBlurhashColumn()
  }

  async down() {
    await new AttachmentSchemaService(this.db.getWriteClient()).dropBlurhashColumn()
  }
}
```

Pass `{ tableName: 'media_attachments' }` to the service when the blob table uses a custom
name. Newly generated attachment-table migrations already include the column.

## Keeping a single JSON column

If a field only ever holds **one file with no variants**, you can keep the v5-style JSON
column with `@attachment()` instead of migrating to the relation tables. Each legacy value
needs a fresh attachment id:

```ts
import { randomUUID } from 'node:crypto'
import { migrateLegacyAttachmentColumn } from '@jrmc/adonis-attachment/lucid'

const avatar = migrateLegacyAttachmentColumn(user.avatar, {
  defaultDisk: 'public',
  createId: randomUUID,
})

user.avatar = avatar
await user.save()
```

Values that contain variants must move to the relation tables - the column mode represents
one file only.
