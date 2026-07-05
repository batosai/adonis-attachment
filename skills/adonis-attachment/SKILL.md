---
name: adonis-attachment
description: Use when adding file or image upload to an AdonisJS Lucid model with @jrmc/adonis-attachment — installation, the @attachment/@attachments decorators and their options, creating attachments from file/buffer/base64/path/URL/stream, deleting files, and serving/displaying them (getUrl, signed URLs, preComputeUrl, attachments route, Inertia/Edge).
---

# AdonisJS Attachment — core usage

`@jrmc/adonis-attachment` turns any field on a Lucid model into an attachment data type. Files are stored through `@adonisjs/drive`, metadata is saved as JSON in the column, and the package handles persistence, replacement and deletion automatically via model hooks.

Full documentation: https://adonis-attachment.jrmc.dev

## Installation

Requires `@adonisjs/drive` (install and configure it first if missing).

```sh
node ace add @jrmc/adonis-attachment
```

Image variants require `sharp` (optional peer dependency):

```sh
npm install sharp
```

## Database column

The column MUST use a JSON data type (metadata can exceed a `string` column length):

```ts
// migration
this.schema.createTable(this.tableName, (table) => {
  table.increments()
  table.json('avatar')
})

// or alter an existing column
this.schema.alterTable(this.tableName, (table) => {
  table.json('avatar').alter()
})
```

## Model setup

⚠️ Do NOT combine `@column()` with `@attachment()` on the same property.

```ts
import { BaseModel } from '@adonisjs/lucid/orm'
import { attachment } from '@jrmc/adonis-attachment'
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment'

class User extends BaseModel {
  @attachment()
  declare avatar: Attachment | null
}
```

### Decorator options

| Option | Default | Description |
|---|---|---|
| `folder` | — | Subfolder: string, path params (`'uploads/:name/avatars'`), or function `(row) => string` |
| `disk` | drive default | Drive disk name (e.g. `'s3'`) |
| `variants` | — | Variant names to pre-generate after save (e.g. `['thumbnail', 'medium']`) |
| `meta` | `true` | Extract EXIF metadata |
| `rename` | `true` | Rename file to a UUID; also accepts a function `(row, column?, currentName?) => string` |
| `preComputeUrl` | `false` | Compute URLs automatically after SELECT queries |
| `serializeAs` | property name | Rename or hide (`null`) in serialized output |
| `serialize` | full JSON | Custom serializer `(value?: Attachment) => any` |

```ts
class User extends BaseModel {
  @attachment({ folder: 'uploads/avatars', variants: ['thumbnail'], preComputeUrl: true })
  declare avatar: Attachment | null
}
```

Notes:
- Path params in `folder` accept string attributes only (lowercased, slugified); `:id` is not available on first save (autoincrement).
- `rename` functions can be async and can use `:model_attribute` placeholders (e.g. `':id.jpg'`).

### Multiple files: `@attachments`

```ts
import { attachments } from '@jrmc/adonis-attachment'

class User extends BaseModel {
  @attachments()
  declare files: Attachment[] | null
}
```

Accepts the same options. ⚠️ Resource-intensive with many objects — prefer a Lucid `hasMany` relation with `@attachment` on the child model for large collections.

## Creating attachments (controller)

All factories live on `attachmentManager`:

```ts
import { attachmentManager } from '@jrmc/adonis-attachment'

// From an uploaded file
user.avatar = await attachmentManager.createFromFile(request.file('avatar')!)

// From several uploaded files
user.files = await attachmentManager.createFromFiles(request.files('files'))

// From a Buffer
user.avatar = await attachmentManager.createFromBuffer(buffer, 'photo.jpg')

// From Base64 (data-uri prefix allowed)
user.avatar = await attachmentManager.createFromBase64(b64, 'photo.jpg')

// From a local path
user.avatar = await attachmentManager.createFromPath(app.makePath('me.jpg'), 'photo.jpg')

// From a URL
user.avatar = await attachmentManager.createFromUrl(new URL('https://site.com/picture.jpg'))

// From a stream
user.avatar = await attachmentManager.createFromStream(fs.createReadStream(path), 'video.mkv')

await user.save()
```

File writing, replacement (old file removal) and deletion on model delete are handled by model hooks — never write to drive manually for these columns.

### Deleting a file

```ts
user.avatar = null
await user.save()
```

## Serving files

### Direct URLs (recommended, SEO-friendly)

Prefer direct drive URLs for public images: the path is stable and descriptive (e.g. `/uploads/avatars/xxx.jpg`), which is what you want for image SEO. In Edge:

```edge
<img src="{{ await user.avatar.getUrl() }}" />
<img src="{{ await user.avatar.getUrl('thumbnail') }}" />
<img src="{{ await user.avatar.getSignedUrl({ expiresIn: '30 mins' }) }}" />
<img src="{{ await user.avatar.getSignedUrl('thumbnail') }}" />
```

`getSignedUrl` options: `expiresIn`, `contentType`, `contentDisposition`.

### preComputeUrl (Inertia, APIs)

With `preComputeUrl: true` (decorator or global config), URLs are available synchronously after SELECT queries:

```tsx
<img src={user.avatar.thumbnail.url} />
```

For occasional needs, prefer computing on demand instead of enabling it globally:

```ts
await attachmentManager.computeUrl(user.avatar)
await attachmentManager.computeUrl(user.avatar.getVariant('thumbnail'), { expiresIn: '30 mins' })
```

### Attachments route (v5+)

`router.attachments()` serves files through a controller and generates missing variants on the fly (query string `?variant=thumbnail`):

```ts
// start/routes.ts
import router from '@adonisjs/core/services/router'

router.attachments() // default pattern: '/attachments/:key/:name?'
// custom: router.attachments('/assets/:key/*').as('assets')
```

```edge
<img src="{{ route('attachments', { key: user.avatar.getKeyId(), name: 'image.jpg' }, { qs: { variant: 'thumbnail' } }) }}" />
```

⚠️ Not recommended for public, SEO-sensitive images: URLs are opaque keys (`/attachments/:key`) with the variant in a query string, which indexes poorly compared to direct drive URLs. Use this route for private files, back-office screens, or when on-the-fly variant generation is the priority.

## Attachment object

Properties: `name`, `originalName`, `folder`, `path`, `size`, `extname`, `mimeType`, `meta` (EXIF), `url`, `variants`.
Methods: `getUrl(variant?)`, `getSignedUrl(...)`, `getVariant(name)`, `getKeyId()`, `getDisk()`, `getBytes()`, `getBuffer()`, `getStream()`.

## Global config

`config/attachment.ts` — global defaults for `meta`, `rename`, `preComputeUrl`, plus `timeout` (default 30000 ms), `queue.concurrency` and converters:

```ts
import { defineConfig } from '@jrmc/adonis-attachment'
import { InferConverters } from '@jrmc/adonis-attachment/types/config'

const attachmentConfig = defineConfig({
  preComputeUrl: false,
  meta: true,
  rename: true,
  converters: {
    thumbnail: { resize: 300 },
  },
})

export default attachmentConfig

declare module '@jrmc/adonis-attachment' {
  interface AttachmentVariants extends InferConverters<typeof attachmentConfig> {}
}
```

For variants, converters (image/video/PDF/document thumbnails, blurhash), queue, events and regeneration, see the `adonis-attachment-variants` skill or https://adonis-attachment.jrmc.dev/guide/converters/autodetect.html

## Error handling

Exceptions are importable: `import { errors } from '@jrmc/adonis-attachment'` — e.g. `E_CANNOT_CREATE_ATTACHMENT`, `E_ISNOT_BUFFER`, `E_ISNOT_BASE64`, `E_CANNOT_CREATE_VARIANT`, plus Drive errors (`E_CANNOT_WRITE_FILE`, ...). Handle them in the app `ExceptionHandler.handle()` with `instanceof`.
