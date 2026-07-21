# Migrate from v5

Version 6 is a breaking release. Attachments are no longer persisted as nested JSON in the parent model by default.

1. Generate and run the attachment schema migration with `node ace make:attachments-table`. It delegates the blob and link definitions to `AttachmentSchemaService` from the package.
2. Generate an application-specific data migration script with `node ace make:attachment-v5-migration`.
3. Complete `legacyAttachmentRecords` in the generated `database/scripts` file: it must yield each legacy JSON value and its `{ type, id, field }` owner.
4. Run the script in a staging copy of the database, validate its output, then run it in production.
5. Deploy code that reads from the new persistence layer before removing the legacy JSON columns.

The script uses `migrateLegacyAttachmentRecords`, which writes blob and link rows in batches of 100 by default. Each batch is inserted in one transaction by the generated script. It preserves file paths, disk names, metadata, and the relationship between an original and its variants. It does not move files in storage.

The package cannot infer the legacy model, JSON column, or polymorphic owner from an application. The generated script deliberately leaves that mapping to the application instead of guessing it. Use `--disk=s3` or `--folder=database/scripts` to change its defaults.

## Retaining a single JSON column

v6 can retain one attachment JSON column with `@attachment()`. A v5 document needs a new attachment id before it can be used by v6. For a column without variants, migrate each value with `migrateLegacyAttachmentColumn` and write the returned value back to the JSON column:

```ts
import { randomUUID } from "node:crypto";
import { migrateLegacyAttachmentColumn } from "@jrmc/adonis-attachment/lucid";

const avatar = migrateLegacyAttachmentColumn(user.avatar, {
  defaultDisk: "public",
  createId: randomUUID,
});

user.avatar = avatar;
await user.save();
```

Legacy attachments containing variants must migrate to the polymorphic table instead: the v6 column mode intentionally represents one file only.

## Attachment links table

The current `make:attachments-table` stub creates `attachments` for blobs and `attachment_links` for polymorphic ownership. The nullable `position` column used by `@attachmentsRelation()` collections belongs to `attachment_links`:

```ts
export default class AddAttachmentPosition extends BaseSchema {
  protected tableName = "attachment_links";

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer("position").unsigned().nullable();
    });
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn("position");
    });
  }
}
```

Existing singular links keep `position = NULL`. New collection links are assigned contiguous zero-based positions by the relation manager.

The prior v6 alpha used one `attachments` table for both blobs and links. It is intentionally not a stable schema. Before adopting this alpha, create the new schema and migrate each existing original into one blob plus one link, then move its variants to blobs with `parent_id` pointing to the migrated original. The package’s v5 migration command targets the current two-table schema.
