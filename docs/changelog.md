# Changelog

New features, changes, and fixes in Adonis Attachment v6.
For earlier versions, see the [v5 changelog](https://adonis-attachment.jrmc.dev/changelog).

## 6.0.0-beta.5

### Added

- Root configuration helpers: `store.lucid()`, `storage.local()`, `storage.drive()`,
  `queue.memory()` and `queue.adonis(options)`, available from `@jrmc/adonis-attachment`.
  Without options, helpers use application defaults; with options, they configure the
  adapter explicitly. `queue.adonis()` requires options containing an application-defined job.
  Existing classes, `fromApp`, `configure`, adapter instances and named queues remain supported.
  See [Configuration](/guide/configuration).

### Fixed

- Preserve generated variant files when a Lucid commit has an uncertain outcome or a
  post-commit operation fails, preventing persisted variants from losing their files.
- Prevent a throwing or rejecting memory queue `onFailure` callback from causing an
  unhandled rejection. The queue emits a warning and continues processing pending jobs.
- Enforce `sources.maxBytes` while downloading URL sources with native fetch or a streaming
  client, including responses with missing or inaccurate `Content-Length` headers.
  Rejected downloads are cancelled. Custom clients exposing only `arrayBuffer()` remain
  supported, with size validation after buffering.
- Derive Sharp variant filenames and MIME types from the encoded output, including SVG
  rasterization and format options that preserve the input format.
- Accept the native Sharp factory directly in converter helpers without TypeScript casts,
  and align supported option types with Sharp.
- Register attachment events with the Adonis emitter types so `emitter.on()` subscriptions
  infer their payloads without application-level type declarations.
- Use `resize: { width: 320 }` in the generated thumbnail configuration example so enabling
  it actually resizes the image.

### Documentation

- Prefer the configuration helpers throughout the guides, README, generated configuration
  and bundled skills. Skills now include a date-based revision in their metadata.
- Correct variant examples to configure the Lucid store and resolve the full attachment
  service from the container for low-level generation. Clarify event payloads, URL download
  limits and memory queue failure handling.

## 6.0.0-beta.4

### Changed

- **Breaking:** file routes are now declared explicitly with `router.attachments()` in
  `start/routes.ts`. No public route is registered automatically. The returned native
  Adonis route supports middleware, groups, names and prefixes.
- Each route serves only `defaultDisk` unless an explicit `disks` list is provided.
  Files outside the allowed disks return `404` before storage is read. Public and private
  disks can be exposed through separate routes with application authorization middleware.
- Remove the former `route` configuration key; it now raises a migration error.
  See [Serving files](/guide/serving-files).

## 6.0.0-beta.3

### Changed

- Support @adonisjs/queue 0.7.0

## 6.0.0-beta.2

### Added

- Storage, store and queue share the `(app, context)` adapter factory convention.
  `LocalFileStorage`, `AdonisDriveStorage`, `MemoryAttachmentQueue` and
  `AdonisAttachmentQueue` now offer `configure(options)`. Memory also offers `fromApp`.
  Existing instances, one-argument factories, driver shortcuts and named queues remain supported.
- Custom queue factories receive an optional `context.handler` from the selected store or
  `jobHandler`. See [configuration](/guide/configuration#a-common-adapter-pattern).

- [`AttachmentRelation.getUrl()`](/guide/lucid#public-urls) resolves public storage URLs directly from singular Lucid relations, without importing `attachmentService` or enabling `preComputeUrl`.
- Named variants are supported through typed `AttachmentVariantKey` keys. Use `{ fallback: 'original' }` to display the original while a variant has no persisted record.

```ts
const originalUrl = await user.avatar.getUrl()
const thumbnailUrl = await user.avatar.getUrl('thumbnail')
const previewUrl = await user.avatar.getUrl('thumbnail', { fallback: 'original' })
```

The method returns `Promise<string | null>`. An empty relation, an absent variant without
fallback, or a storage backend without a public URL returns `null`. Fallback applies only
when the variant record is absent; storage errors propagate. The original may have a
different MIME type from the requested variant.

### Changed

- **Breaking import change:** storage modules move from `/adapters/local-file` and
  `/adapters/adonis-drive` to `/storages/local-file` and `/storages/adonis-drive`.
  Internal modules now live under `src/storages/`, alongside `src/stores/` and
  `src/queues/`. Root imports of `LocalFileStorage` and `AdonisDriveStorage` are unchanged.

- **Breaking configuration change:** `store` now selects data persistence explicitly,
  independently of `storage`. Lucid is no longer auto-detected. Use
  `store: LucidAttachmentStore.fromApp`, or `LucidAttachmentStore.configure({ tableName, legacy })`.
- Root `integrations`, `repository`, `processor`, and `media.metadataPersister` have been
  replaced by store capabilities. Removed keys fail with a migration message instead of
  silently selecting a different data store.
- `createAttachmentProcessor(app)` uses the configured store for both memory and external
  workers, including mixed Lucid table/legacy applications and custom stores. `jobHandler`
  remains available for fully custom memory processing.

- Internal Lucid modules now live under `src/stores/lucid/`, with legacy JSON support
  grouped under `legacy/`. Store assembly is isolated in `config.ts`; public `/lucid`
  and `/legacy` imports remain unchanged.

### Documentation

- Added [Creating a store](/guide/creating-a-store), with a complete class, a `fromApp`
  factory, optional processing capabilities and the steps for adapting it to another ORM.
- Added this changelog to the documentation navigation.
- Updated the Lucid and file-serving guides, plus application integration, media, and migration skills, to use the native relation URL method.
- Clarified installation instructions in the quickstart and migration skill guide.

### Upgrading from beta.1

Once beta.2 is published:

```sh
npm install @jrmc/adonis-attachment@6.0.0-beta.2
```

Update existing configurations before booting beta.2. Follow the
[configuration migration table](/guide/configuration#migrating-from-earlier-v6-betas).
The store refactor requires no data or schema migration. Existing URL APIs continue to work. To replace an application helper that falls back to the original, use
`await user.avatar.getUrl('thumbnail', { fallback: 'original' })`.

## 6.0.0-beta.1

First v6 beta, following the alpha releases. Version 6 introduces breaking changes from
v5; follow the [migration guide](/migration/from-v5) before upgrading an existing app.

- Separated attachment creation, storage, persistence, and processing. Managers create drafts; explicit persistence or a Lucid owner save writes the files.
- Made Lucid, Adonis Drive, and Adonis Queue optional, with local filesystem storage and an in-memory queue available out of the box.
- Added [table-backed Lucid relations](/guide/lucid) for singular attachments, ordered collections, and shared files, with transaction-aware persistence and cleanup.
- Added a [/legacy integration](/guide/legacy) for existing JSON fields and collections, including variants, metadata, and background processing.
- Added [custom persistence and processing adapters](/guide/custom-persistence) for other data stores.
- Included [variant path configuration](/guide/configuration), typed converters, metadata extraction, regeneration, and [named queue connections](/guide/queues).
- Included [installable agent skills](/guide/agent-skills) for application integration, media processing, and v5 migration.

Requires AdonisJS 7 and Node.js 24. Pre-releases use the npm `next` tag.
