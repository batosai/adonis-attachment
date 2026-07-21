# Introduction

`@jrmc/adonis-attachment` v6 separates attachment creation, file storage, database persistence, and background processing.

The package requires AdonisJS Core. Drive, Lucid, and `@adonisjs/queue` are optional integrations.

An `Attachment` is a plain immutable value describing a stored file:

```ts
{
  id: '018f...',
  disk: 'public',
  path: 'users/42/018f....jpg',
  originalName: 'profile.jpg',
  mimeType: 'image/jpeg',
}
```

`AttachmentManager` creates an in-memory draft from buffers, multipart files, paths, URLs, streams, and Base64 sources. Calling `persist()` turns it into the stored `Attachment` value shown above.

Your application chooses how that value is persisted. The Lucid integration provides `attachments` blobs and polymorphic `attachment_links` for projects that want database-backed ownership and variants.

Projects using another ORM or a custom data store can persist the same value directly; see [Custom Persistence](/guide/custom-persistence).

Variants use the same lifecycle as originals: generate bytes with a converter, store the generated file, then persist a child attachment row when Lucid is enabled.
