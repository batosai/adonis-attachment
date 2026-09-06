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

### Folder and rename

`folder` is either a static relative path or a callback. `rename` is `true` (the default,
generates an id-based name), `false` (derives the stored name from the client name), or a
callback returning the stored filename. Both callbacks receive `{ model, field, originalName }`
and may be async.

```ts
const draft = await attachmentManager.createFromFile(request.file('avatar')!, {
  folder: () => `users/${user.id}/avatar`,
  rename: ({ originalName }) => `profile-${originalName}`,
})
```

When a model is available, strings also support V5-style `:attribute` parameters. String
attribute values are lowercased, HTML-escaped, then slugified before they are inserted:

```ts
folder: 'uploads/:name/avatars'
rename: () => ':name-avatar.jpg'
```

For `name = 'Jane Doe'`, this produces `uploads/jane-doe/avatars/jane-doe-avatar.jpg`.
Lucid supplies the model automatically. For standalone use, `:attribute` is not replaced
unless you persist the draft with an explicit model context.

The manager does not infer your model type. The example above closes over an already
loaded `user`; for a new Lucid owner whose ID is assigned on save, put the model-dependent
callback on the [relation decorator](/guide/lucid#paths-from-model-attributes) instead.

## Good to know

- **Storage-safe filenames**: Names derived with `rename: false` or returned by a `rename`
  callback are normalized before storage by default: accents are transliterated, punctuation
  and spaces become hyphens, and the extension is retained. For example,
  `Capture d’écran.png` becomes `capture-d-ecran.png`. The unmodified client name remains in
  `originalName` for display. This keeps keys compatible with Adonis Drive and Flydrive. Set
  `normalizeFileName: false` to keep the supplied storage name; Drive may then reject it.
- **Size limits** are opt-in. Set a global `sources.maxBytes` in config, and/or a per-call
  `maxBytes`; the smaller of the two applies.
- **MIME types** from URLs come from the `content-type` header when present, otherwise
  they're inferred from the filename. This inference is a convenience, **not** a security
  check - validate allowed types and content in your app.
- **Streams** are read chunk by chunk and the size limit is enforced as bytes arrive.

**Next:** [Image variants](/guide/variants).
