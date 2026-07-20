# Sources

`AttachmentManager` normalizes common input sources into drafts. It is independent from Lucid and does not inspect media metadata; the media pipeline adds that later. A draft writes no file until `persist()` is called, unless an integration such as the Lucid decorator persists it during `save()`.

The Adonis provider binds it as `jrmc.attachment.manager`:

```ts
const manager = await app.container.make('jrmc.attachment.manager')
```

## Adonis service

In an AdonisJS application, import the ready-to-use manager from the package root:

```ts
import { attachmentManager } from '@jrmc/adonis-attachment'

const attachment = await attachmentManager.createFromBuffer(buffer, {
  originalName: 'avatar.png',
  mimeType: 'image/png',
})

await attachment.persist()
```

It accepts buffers, Base64 values and data URIs, local paths, Node readable streams, URLs, and Adonis multipart files.

```ts
const fromBuffer = await manager.createFromBuffer(fileBytes, {
  originalName: 'avatar.jpg',
  folder: `users/${user.id}`,
})

const fromFile = await manager.createFromFile(request.file('avatar')!)
const fromPath = await manager.createFromPath(app.makePath('imports/report.pdf'))
const fromUrl = await manager.createFromUrl('https://example.test/cover.webp')
const fromStream = await manager.createFromStream(stream, { originalName: 'video.mp4' })
const fromBase64 = await manager.createFromBase64('data:image/png;base64,...', {
  originalName: 'avatar.png',
})
```

`createFromFiles` accepts a list of multipart files and resolves them in parallel. Every method accepts `disk`, `folder`, `rename`, `meta`, `preComputeUrl`, `variants`, `metadata`, `mimeType`, and `originalName` where applicable. These options take precedence over decorator and configuration defaults.

## Source limits

The package does not define a size policy by default: validate uploads in the application. An application may configure an optional technical byte limit for every source; a call may lower it with `maxBytes`.

```ts
import { defineConfig, LocalFileStorage } from '@jrmc/adonis-attachment'

export default defineConfig({
  storage: LocalFileStorage.fromApp,
  sources: { maxBytes: 10 * 1024 * 1024 },
})
```

URL sources reject unsuccessful HTTP responses. Their MIME type comes from `content-type` when supplied, otherwise it is inferred from the filename. The lightweight filename inference is deliberately not a security validation; validate allowed MIME types and file content in the application or with the future media pipeline.
