# Migrate from v5

Version 6 is a breaking release. Attachments are no longer persisted as nested JSON in the parent model by default.

1. Generate and run the polymorphic attachments migration.
2. Read each existing JSON column from the v5 model.
3. Convert each value with `migrateLegacyAttachment`.
4. Insert the generated original and variant rows in the new table.
5. Deploy code that reads from the new persistence layer before removing the legacy JSON columns.

`migrateLegacyAttachment` preserves file paths, disk names, metadata, and the relationship between an original and its variants. It does not move files in storage.
