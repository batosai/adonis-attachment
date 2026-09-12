---
name: adonis-attachment-migration
description: Use when explicitly upgrading an AdonisJS application from @jrmc/adonis-attachment v5 to v6, choosing between retaining JSON fields and collections through /legacy and migrating to blob/link tables, or adapting v5 attachment code and configuration.
metadata:
  package: "@jrmc/adonis-attachment"
  major-version: "6"
---

# Migrate an application from v5 to v6

This skill targets a consuming application upgrading to Adonis Attachment v6 on AdonisJS 7
and Node.js 24+. Inspect the installed/source versions, migrations, actual legacy JSON,
storage disks/paths, owner models, converters, and queue before choosing a mapping.
For other source versions, determine the intermediate migration first; do not assume the
v5 mapping applies. Read [migration procedure](references/migration.md).

## Preserve data and intent

- A normal upload task does not authorize a major upgrade. Plan schema/data changes before
  running them. Back up database AND files, rehearse on copies, and obtain approval for production writes.
- Choose per field: keep JSON through the experimental `/legacy` facade, or migrate
  to default `/lucid` tables. Verify the installed build exports the needed legacy APIs.
  Legacy collections use arrays without reordering. A JSON-only cutover needs no attachment/link/lock tables.
- `/lucid` decorators represent table relations, not JSON columns. Both originals and variants are blobs;
  separate links carry owner type, ID, field, singular uniqueness, and collection position.
- Default tables are `adonis_attachments` / `adonis_attachment_links`. Respect any explicit
  `integrations.lucid.tableName`; configuration does not rename existing tables or move files.
- For a JSON-to-table migration, read source JSON through the query builder or a separate
  legacy model, not the new `/lucid` accessor. Migrate only the fields selected for tables.
- For retained JSON, import the decorator, type and manager from `/legacy`, keep the column
  without a second `@column()`, and register `integrations.legacy.models` for processing.
  Do not use removed `integrations.lucid.jsonModels` or `AttachmentRelation<'json'>` APIs.
- Preserve paths, disk names, metadata, blurhashes, variant associations, and collection order.
  Do not reupload originals or regenerate all variants as a substitute for a data migration.
- JSON-to-table batches commit independently and are not automatically idempotent. On failure stop and
  identify committed work before retrying. Never blindly replay a collection migration.
- Keep old columns until verified cutover. Do not reset databases, delete original files,
  drop legacy columns, or execute destructive recovery without explicit authorization.

Verify counts, sample reads/URLs, variants, ordering, replacement and cleanup in staging.
Stop v5 writers/jobs before a legacy-facade cutover; do not run both JSON writers together.
For a table migration, stop or explicitly reconcile concurrent v5 uploads. Report any
untested mapping or operational precondition instead of declaring a
migration safe solely because its script compiles.
