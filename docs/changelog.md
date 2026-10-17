# Changelog

New features, changes, and fixes in Adonis Attachment v6.
For earlier versions, see the [v5 changelog](https://adonis-attachment.jrmc.dev/changelog).

## 6.0.0-beta.2

> In preparation — not yet published.

### Added

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

### Documentation

- Added this changelog to the documentation navigation.
- Updated the Lucid and file-serving guides, plus application integration, media, and migration skills, to use the native relation URL method.
- Clarified installation instructions in the quickstart and migration skill guide.

### Upgrading from beta.1

Once beta.2 is published:

```sh
npm install @jrmc/adonis-attachment@6.0.0-beta.2
```

No schema or configuration changes are required for this addition. Existing URL APIs
continue to work. To replace an application helper that falls back to the original, use
`await user.avatar.getUrl('thumbnail', { fallback: 'original' })`.

## 6.0.0-beta.1

First v6 beta, following the alpha releases. Version 6 introduces breaking changes from
v5; follow the [migration guide](/migration/from-v5) before upgrading an existing app.

- Separated attachment creation, storage, persistence, and processing. Managers create drafts; explicit persistence or a Lucid owner save writes the files.
- Made Lucid, Adonis Drive, and Adonis Queue optional, with local filesystem storage and an in-memory queue available out of the box.
- Added [table-backed Lucid relations](/guide/lucid) for singular attachments, ordered collections, and shared files, with transaction-aware persistence and cleanup.
- Added an experimental [/legacy integration](/guide/legacy) for existing JSON fields and collections, including variants, metadata, and background processing.
- Added [custom persistence and processing adapters](/guide/custom-persistence) for other data stores.
- Included [variant path configuration](/guide/configuration), typed converters, metadata extraction, regeneration, and [named queue connections](/guide/queues).
- Included [installable agent skills](/guide/agent-skills) for application integration, media processing, and v5 migration.

Requires AdonisJS 7 and Node.js 24. Pre-releases use the npm `next` tag.
