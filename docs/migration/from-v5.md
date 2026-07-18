# Migrate from v5

Version 6 is a breaking release. Attachments are no longer persisted as nested JSON in the parent model by default.

1. Generate and run the polymorphic attachments migration with `node ace make:attachments-table`.
2. Generate an application-specific data migration script with `node ace make:attachment-v5-migration`.
3. Complete `legacyAttachmentRecords` in the generated `database/scripts` file: it must yield each legacy JSON value and its `{ type, id, field }` owner.
4. Run the script in a staging copy of the database, validate its output, then run it in production.
5. Deploy code that reads from the new persistence layer before removing the legacy JSON columns.

The script uses `migrateLegacyAttachmentRecords`, which writes rows in batches of 100 by default. It preserves file paths, disk names, metadata, and the relationship between an original and its variants. It does not move files in storage.

The package cannot infer the legacy model, JSON column, or polymorphic owner from an application. The generated script deliberately leaves that mapping to the application instead of guessing it. Use `--disk=s3` or `--folder=database/scripts` to change its defaults.
