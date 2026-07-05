# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Codex...) when working with code in this repository.

## Project

`@jrmc/adonis-attachment` is an AdonisJS 6/7 package (ESM, Node >= 20.12) that turns Lucid model fields into attachment data types, with variant generation (image resize, blurhash, video/PDF/document thumbnails). Docs live in `docs/` (VitePress) and are published at https://adonis-attachment.jrmc.dev.

## Commands

```sh
npm test                     # Full test suite with c8 coverage
npm run quick:test           # Tests without coverage (faster)
npm run quick:test -- --files=attachment-variants   # Run matching spec files
npm run quick:test -- --tests="test title"          # Run a single test by title
npm run typecheck            # tsc --noEmit
npm run build                # clean + tsc + copy stubs + index commands into build/
npm run format               # prettier --write .
npm run docs:dev             # VitePress dev server for docs/
```

Tests boot a real AdonisJS app (IgnitorFactory in `tests/helpers/app.ts`) with a better-sqlite3 database created in setup and removed in teardown. Test converters live in `tests/fixtures/converters/`. Sharp is required for variant tests.

## Architecture

The package hooks into Lucid's model lifecycle; understanding the flow requires connecting these pieces:

- **`providers/attachment_provider.ts`** — registers the `jrmc.attachment` container singleton (an `AttachmentManager` wired with the Drive service and a lock service; falls back to an in-memory verrou lock if `@adonisjs/lock` is absent). Also extends the router with `router.attachments()` which serves files through `src/controllers/attachments_controller.ts`. Declares the `attachment:variant_started/completed/failed` events.

- **`src/attachment_manager.ts`** — factory for `Attachment` instances: `createFromFile/Files/Path/Buffer/Base64/Url/Stream/DbResponse`. Holds a `DeferQueue` (`@poppinss/defer`) used for async variant generation. Applies global config options (meta, rename, preComputeUrl) to every attachment it creates.

- **`src/decorators/attachment.ts`** — `@attachment()` and `@attachments()` (array variant). Each decorator registers a Lucid column with `consume` (DB JSON → `Attachment`), `prepare` (`Attachment` → `toDbString()`), and `serialize`, stores per-column options on the model prototype under `optionsSym`, and calls `bootModel()` which registers the lifecycle hooks exactly once per model.

- **`src/utils/hooks.ts`** — lifecycle glue, delegating to `AttachmentRecordService`:
  - `beforeSave`: detach replaced files, persist new files, register transaction rollback
  - `afterSave`: generate variants (queued), set key ids
  - `beforeDelete`: detach all files (rollback disabled)
  - `afterFind/afterFetch/afterPaginate`: set key ids, pre-compute URLs

- **`src/services/`** — the actual work, split in two families: `attachment/` (persister, detachment, recorder, transaction, variant orchestration) and `variant/` (generator, persister, purger). `attachment_service.ts` re-exports `AttachmentRecordService`.

- **`src/attachments/`** — `AttachmentBase` (name/folder/meta/drive I/O), `Attachment` (adds variants, `toDbString`, `toJSON`), `VariantAttachment`.

- **`src/converters/`** — `Converter` base class plus image (sharp), video/PDF/document thumbnail converters. `autodetect_converter.ts` is the default when a config entry omits `converter`. Converters are resolved lazily at boot by `src/define_config.ts` (config provider pattern). External binaries (ffmpeg, poppler, soffice) are invoked through `src/adapters/`, with paths overridable via the `bin` config.

- **`commands/`** — `ace` commands: variant regeneration (backed by `services/regenerate_service.ts`) and `make:convert` (stubs in `stubs/`).

- **Package exports** — consumers import via the subpaths declared in `package.json#exports` (e.g. `@jrmc/adonis-attachment/types/attachment`, `/converters/*`); all map to `build/`. Internal code must use the same subpath aliases when referencing lazily-imported modules (see the provider and `define_config.ts`).

## Conventions

- Source files start with the `@jrmc/adonis-attachment` license header block.
- Relative imports use explicit `.js` extensions (ESM/NodeNext).
- Prettier config comes from `@adonisjs/prettier-config`.
- Publishing is beta-tagged (`publishConfig.tag: beta`); version bumps happen on `package.json` directly.
