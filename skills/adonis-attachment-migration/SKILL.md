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

## Agent execution contract

This is an implementation task, not a read-only audit. First inventory v5 attachment fields;
unless the user limits the scope, migrate every field whose v5 mapping is unambiguous. Infer
singular versus collection fields from decorators and stored values. Report ambiguous fields and
leave only those untouched, then continue with the required code and configuration changes.

- Work only in the current project and preserve unrelated working-tree changes. Do not commit.
- Confirm AdonisJS 7 and Node.js 24+ before upgrading. Upgrading the framework itself is out of
  scope. Upgrade this package to the requested v6 release, run its configure hook, and verify
  the installed exports before using `/legacy`.
- Do not use `--legacy-peer-deps`, `--force`, `--omit`, `npm prune`, or `npm dedupe` to force an
  installation. Report peer conflicts instead. After each permitted installation, inspect the
  package manifest and lockfile diff; stop if unrelated dependencies were removed or changed.
- Update `config/attachment.ts`; do not leave a migration TODO. Compare the effective v5
  defaults, including omitted values, with v6 defaults and configure any behaviour the project
  relies on when it differs. Preserve the storage adapter, disk names, paths, converters,
  metadata policy, binaries, queue routing and routes deliberately.
- Search application code, routes and configuration for removed v5 APIs and replace every
  unambiguous usage; do not merely report them. This includes `router.attachments()`,
  `keyId`/`getKeyId()`, manual variant insertion/deletion, `integrations.lucid.jsonModels`,
  `persistence: 'json'`, `AttachmentRelation<'json'>` and obsolete manager overloads. Adapt
  v5 converter handlers to the v6 input/output contract and choose the route appropriate to
  `/legacy` or table-backed fields.
- Install only optional dependencies required by the resulting configuration: `sharp` for image
  variants or technical image metadata, `exifreader` for EXIF/GPS, `blurhash` with `sharp` when
  enabled, `@adonisjs/drive` for Drive and `@adonisjs/queue` for external queues. Verify ffmpeg,
  Poppler and LibreOffice in the target runtime when configured; do not install system binaries
  implicitly.
- Do not run schema/data migrations, seeders, storage-writing commands, cleanup commands or
  production cutover steps. Add focused non-destructive tests and run available non-destructive
  checks. Report changed files, checks and remaining human production steps.

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
- For retained JSON, import the decorator, type and manager from `/legacy` and register
  `integrations.legacy.models` for processing. The decorator takes over a matching `@column()`
  inherited from generated schema base classes or mixins, so keep the SQL column and generated
  TypeScript field without adding `skipColumns` rules.
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
