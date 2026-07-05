---
name: adonis-attachment-migration
description: Use when upgrading @jrmc/adonis-attachment between major versions (v1→v2, v2→v3, v3→v4, v4→v5) or migrating from attachment-advanced — breaking changes in config structure, converter options, binary paths, URL/serialization APIs, and the JSON data structure stored in database.
---

# AdonisJS Attachment — version migrations

Breaking changes per major version of `@jrmc/adonis-attachment`. Apply every section between the installed version and the target version, in order.

Changelog: https://adonis-attachment.jrmc.dev/changelog.html

## v4 → v5

**Remove the optional wrapper packages** — the package now talks to binaries directly:

```sh
npm uninstall node-poppler libreoffice-file-converter fluent-ffmpeg
```

**Renamed `bin` config keys** (if binary paths are set):

| Before (v4) | Now (v5) |
|---|---|
| `pdftocairoBasePath` | `pdftoppmPath` |
| `libreofficePaths` | `sofficePath` |

**Converter `options` wrapper is now optional** (flat options are preferred):

```ts
// Before
thumbnail: {
  converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
  options: { resize: 300, format: 'webp' },
},

// Now
thumbnail: {
  resize: 300,
  format: 'webp',
},
```

**Autodetect converter is the default** — the `converter` key can be omitted entirely; the mime type routes to the image/PDF/document/video converter.

**`autoOrient` is now `true` by default** for image conversion. To keep the previous behaviour add `autoOrient: false` to the converter.

**New in v5 (non-breaking, worth adopting):**
- `router.attachments()` route with on-the-fly variant generation (uses `@adonisjs/lock` if installed, in-memory verrou otherwise)
- `rename` option accepts a function
- v5.1: `variant.basePath` / `variant.ignoreFolder` config, `attachment:variant_*` events, AdonisJS 7 / Lucid 22 compatibility

## v3 → v4

No configuration changes required.

New in v4 (non-breaking): `@attachments()` array decorator, `createFromFiles`, `RegenerateService`, `serializeAs` / custom `serialize`, `folder` with path params or function.

## v2 → v3

**Config structure reworked** — converters go from an array with `key` to a keyed object, and typing is added via `InferConverters`:

```ts
// Before (v2)
import { defineConfig } from '@jrmc/adonis-attachment'

export default defineConfig({
  converters: [
    {
      key: 'thumbnail',
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: { resize: 300 },
    },
  ],
})

// Now (v3)
import { defineConfig } from '@jrmc/adonis-attachment'
import { InferConverters } from '@jrmc/adonis-attachment/types/config'

const attachmentConfig = defineConfig({
  converters: {
    thumbnail: {
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: { resize: 300 },
    },
  },
})

export default attachmentConfig

declare module '@jrmc/adonis-attachment' {
  interface AttachmentVariants extends InferConverters<typeof attachmentConfig> {}
}
```

## v1 → v2

**`@adonisjs/drive` becomes required:**

```sh
node ace add @adonisjs/drive
```

**`basePath` config removed** — replaced by the `location` of the `fs` service in `config/drive.ts`. For compatibility with files stored by v1:

```ts
// config/drive.ts
services: {
  fs: services.fs({
    location: app.publicPath(),
    serveFiles: true,
    routeBasePath: '/uploads',
    visibility: 'public',
  }),
},
```

**APIs became async:**

```ts
user.avatar.getUrl()        // before
await user.avatar.getUrl()  // now

user.avatar.toJSON()        // before
await user.avatar.toJSON()  // now
```

**Serialized variant access changed:**

```html
<img :src="user.avatar.thumbnail" />      <!-- before -->
<img :src="user.avatar.thumbnail.url" />  <!-- now -->
```

## Coming from attachment-advanced (AdonisJS 5)

`@jrmc/adonis-attachment` is the AdonisJS 6/7 successor of `attachment-advanced`. There is no automated migration: reinstall via `node ace add @jrmc/adonis-attachment`, recreate the converter config in `config/attachment.ts` (current structure above), keep the database columns in JSON type, and verify the stored JSON structure against https://adonis-attachment.jrmc.dev/structure-data-json.html

## Database structure reference

The JSON stored per attachment contains `name`, `originalName`, `extname`, `size`, `mimeType`, `path`, `meta` (dimension, gps, orientation, date...), optional `url`, and a `variants` array (each with `key`, `folder`, `name`, `path`, `meta`, optional `blurhash`). Details and full samples: https://adonis-attachment.jrmc.dev/structure-data-json.html
