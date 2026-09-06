---
name: adonis-attachment-migration
description: Use when explicitly upgrading an AdonisJS application from @jrmc/adonis-attachment v5 to v6, migrating legacy JSON columns into blob/link tables, or adapting v5 attachment code to v6 relations and configuration.
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
  running them. Use a database backup or staging copy and obtain approval for production writes.
- V6 decorators represent relations, not JSON columns. Both originals and variants are blobs;
  separate links carry owner type, ID, field, singular uniqueness, and collection position.
- Default tables are `adonis_attachments` / `adonis_attachment_links`. Respect any explicit
  `integrations.lucid.tableName`; configuration does not rename existing tables or move files.
- Read legacy JSON through the query builder or a separate legacy model. Do not read it through
  the new `@attachment()` accessor with the same property name.
- Preserve paths, disk names, metadata, blurhashes, variant associations, and collection order.
  Do not reupload originals or regenerate all variants as a substitute for a data migration.
- Batches commit independently and are not automatically idempotent. On failure stop and
  identify committed work before retrying. Never blindly replay a collection migration.
- Keep old columns until verified cutover. Do not reset databases, delete original files,
  drop legacy columns, or execute destructive recovery without explicit authorization.

Verify counts, sample reads/URLs, variants, ordering, replacement and cleanup in staging.
Only switch application writes after deciding how to stop or reconcile concurrent legacy
uploads. Report any untested mapping or operational precondition instead of declaring a
migration safe solely because its script compiles.
