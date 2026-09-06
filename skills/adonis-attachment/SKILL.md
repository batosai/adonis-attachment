---
name: adonis-attachment
description: Use when integrating @jrmc/adonis-attachment v6 into an AdonisJS application for uploads, Lucid attachment relations, custom persistence, replacement, deletion, and public or private file URLs.
metadata:
  package: "@jrmc/adonis-attachment"
  major-version: "6"
---

# Attachment v6 application integration

Use this skill in the consuming application, not to develop the package itself.
Target AdonisJS 7 and Node.js 24+. Check the installed package version, lockfile,
`adonisrc.ts`, `config/attachment.ts`, storage, and model before changing them.
For an installed v5, do not apply these APIs without an explicit upgrade task.
Preserve existing configuration and the application's chosen ORM and storage.

Read [application workflows](references/workflows.md) for installation, validated uploads,
singular/collection relations, and URLs. Read [custom persistence](references/persistence.md)
when Lucid is not being used for attachments.

## Decisions that matter

- The package is `@jrmc/adonis-attachment` (singular), even when the task says "attachments".
- Core is required; Drive, Lucid, and Adonis Queue are optional. Default storage is
  `LocalFileStorage.fromApp`, not Drive. Configure optional Adonis integrations before use.
- Import `attachmentManager` and `attachmentService` from the package root. Import
  `attachment`, `attachments`, `AttachmentRelation`, and `AttachmentCollectionRelation`
  from `@jrmc/adonis-attachment/lucid`. Root `Attachment` is plain persisted file data.
- Root `attachmentService` exposes URL methods only. For read/remove/scheduling use the
  typed full service from `await app.container.make('jrmc.attachment')` inside the booted app.
- `createFrom*` returns an `AttachmentDraft`, not a written file. Use `draft.persist()`
  manually, or stage it with relation methods and save the owner. Do not assign a draft
  to `user.avatar`, and do not add a JSON column for the v6 decorator.
- `set`, `attach`, `detach`, `addMany`, `move`, and `clear` stage changes. `owner.save()`
  flushes them. Explicit relation `persist()` requires an already persisted owner.
- Options resolve per field: manager call > decorator > `defaults`. `undefined` inherits;
  `null` clears inheritance and restores the fallback; use `false` to disable a boolean.
- Defaults are `adonis_attachments` and `adonis_attachment_links`. Only configure
  `integrations.lucid.tableName`; the link name is its singular form plus `_links`.
  Configuration never renames an existing database table.
- `get()` and collection `all()` return links with a preloaded `.attachment` blob.
  Collection `move/remove` take link IDs. `attachExisting/addExisting` and file routes take blob IDs.
- The built-in `/attachments/:id/:name?` route is public. For private files disable it
  with `route: false`, authorize your own route, and check storage is not publicly exposed.
- Single `variants()` returns blob models, not links. Relations are not automatically
  serialized into API responses; construct the application's response explicitly.

## Verification

Validate the upload in the application before creating a draft. Exercise create, read,
replace, detach, collection ordering, and the relevant failure path. Check both database
rows and stored bytes. Use the consuming project's typecheck and tests; avoid destructive
schema resets or real production file deletion merely to test integration.
When API details differ across alpha releases, inspect the installed public declarations
instead of guessing or importing unpublished `src` modules.
