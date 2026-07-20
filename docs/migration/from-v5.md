# Migrate from v5

Version 6 is a breaking release. Attachments are no longer persisted as nested JSON in the parent model by default.

1. Generate and run the polymorphic attachments migration with `node ace make:attachments-table`.
2. Generate an application-specific data migration script with `node ace make:attachment-v5-migration`.
3. Complete `legacyAttachmentRecords` in the generated `database/scripts` file: it must yield each legacy JSON value and its `{ type, id, field }` owner.
4. Run the script in a staging copy of the database, validate its output, then run it in production.
5. Deploy code that reads from the new persistence layer before removing the legacy JSON columns.

The script uses `migrateLegacyAttachmentRecords`, which writes rows in batches of 100 by default. It preserves file paths, disk names, metadata, and the relationship between an original and its variants. It does not move files in storage.

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

## Attachment table upgrade

The current `make:attachments-table` stub includes the nullable `position` column used by `@attachmentsRelation()` collections. Projects that generated the table from an earlier v6 alpha can add it with a normal Lucid migration:

```ts
export default class AddAttachmentPosition extends BaseSchema {
  protected tableName = "attachments";

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

Existing singular attachment rows keep `position = NULL`. New collection rows are assigned contiguous zero-based positions by the relation manager.
