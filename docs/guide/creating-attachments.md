# Creating attachments

Whatever the input - an upload, a buffer, a URL - you turn it into an attachment through
the **`AttachmentManager`**. It normalizes every source into a [draft](/guide/concepts#_2-drafts-and-persist),
and writes nothing until the draft is persisted.

## The ready-to-use service

In an AdonisJS app, import the global manager from the package root:

```ts
import { attachmentManager } from '@jrmc/adonis-attachment'

const draft = await attachmentManager.createFromBuffer(buffer, {
  originalName: 'avatar.png',
  mimeType: 'image/png',
})

await draft.persist() // now the file is written
```

::: tip
With Lucid decorators and relations you usually **don't** call `persist()` - assigning the
draft and saving the model does it for you. See [With Lucid](/guide/lucid).
:::

You can also resolve it from the container as `jrmc.attachment.manager`.

## Every source

```ts
// A multipart upload (Adonis request.file)
const fromUpload = await attachmentManager.createFromFile(request.file('avatar')!)

// Several uploads at once (resolved in parallel)
const many = await attachmentManager.createFromFiles(request.files('gallery'))

// A raw buffer
const fromBuffer = await attachmentManager.createFromBuffer(bytes, {
  originalName: 'avatar.jpg',
  folder: `users/${user.id}`,
})

// A Base64 string or data URI (the MIME type is read from the data URI)
const fromBase64 = await attachmentManager.createFromBase64('data:image/png;base64,...', {
  originalName: 'avatar.png',
})

// A local file path
const fromPath = await attachmentManager.createFromPath(app.makePath('imports/report.pdf'))

// A remote URL (downloaded via fetch)
const fromUrl = await attachmentManager.createFromUrl('https://example.test/cover.webp')

// A Node readable stream
const fromStream = await attachmentManager.createFromStream(stream, {
  originalName: 'video.mp4',
})
```

## Per-call options

Every method accepts, where relevant: `disk`, `folder`, `rename`, `meta`, `preComputeUrl`,
`variants`, `metadata`, `mimeType`, and `originalName`. These take precedence over decorator
and configuration defaults (see the [precedence rules](/guide/configuration#default-persistence-options)).

Set `meta: true` to run the metadata extractors configured by your application. Explicit
`metadata` is retained and overrides an extracted key with the same name.

```ts
await attachmentManager.createFromFile(request.file('avatar')!, {
  disk: 's3',
  folder: `users/${user.id}/avatar`,
  rename: true,
  maxBytes: 5 * 1024 * 1024, // lower the configured ceiling for this call
})
```

## Good to know

- **Adonis Drive filenames**: Drive (via Flydrive) accepts only ASCII letters and digits,
  spaces, `/`, `.`, `_`, `-`, and `!` in an object key. With `rename: false`, the original
  client filename becomes the key, so names containing accented characters or typographic
  punctuation, such as `Capture d’écran.png`, fail with `E_UNALLOWED_CHARACTERS`. Keep
  `rename: true` (the default), or use a `rename` callback that converts the filename to a
  storage-safe ASCII name while retaining `originalName` for display.
- **Size limits** are opt-in. Set a global `sources.maxBytes` in config, and/or a per-call
  `maxBytes`; the smaller of the two applies.
- **MIME types** from URLs come from the `content-type` header when present, otherwise
  they're inferred from the filename. This inference is a convenience, **not** a security
  check - validate allowed types and content in your app.
- **Streams** are read chunk by chunk and the size limit is enforced as bytes arrive.

**Next:** [Image variants](/guide/variants).
