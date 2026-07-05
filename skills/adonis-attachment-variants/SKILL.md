---
name: adonis-attachment-variants
description: Use when configuring or debugging variants and converters with @jrmc/adonis-attachment — image resize/format/blurhash (sharp), video/PDF/document thumbnails (ffmpeg, poppler, LibreOffice), custom converters, variant storage paths, processing queue, variant lifecycle events, and regenerating variants.
---

# AdonisJS Attachment — variants & converters

Variants are derived files (thumbnails, resized images, previews) generated from an attachment. They are declared as **converters** in `config/attachment.ts`, generated asynchronously in a queue after save (for variants listed in the decorator's `variants` option) or on the fly by the attachments route.

Full documentation: https://adonis-attachment.jrmc.dev

## Configuration

```ts
// config/attachment.ts
import { defineConfig } from '@jrmc/adonis-attachment'
import { InferConverters } from '@jrmc/adonis-attachment/types/config'

const attachmentConfig = defineConfig({
  converters: {
    thumbnail: {
      resize: 300,
      format: 'webp',
    },
    medium: {
      resize: 600,
      blurhash: true,
    },
  },
})

export default attachmentConfig

declare module '@jrmc/adonis-attachment' {
  interface AttachmentVariants extends InferConverters<typeof attachmentConfig> {}
}
```

The `declare module` block gives typed variant names — keep it in sync.

When no `converter` is specified, the **autodetect converter** picks the right one from the mime type (image / PDF / document / video). Since v5, converter options are flat (no `options: {}` wrapper needed, though still accepted).

Then in the model, list the variants to pre-generate:

```ts
@attachment({ variants: ['thumbnail', 'medium'] })
declare avatar: Attachment | null
```

Pre-generation is optional when using `router.attachments()` — missing variants are generated on demand.

## Image converter (sharp)

Requires `npm install sharp`.

```ts
thumbnail: {
  converter: () => import('@jrmc/adonis-attachment/converters/image_converter'), // optional, autodetect covers it
  resize: 300,                 // number, or sharp resize object:
  // resize: { width: 400, height: 400, fit: 'cover', position: 'top' },
  format: 'jpeg',              // default 'webp'; string or { format, options: { quality: 80 } }
  autoOrient: false,           // default true (EXIF-based rotation)
  blurhash: true,              // default false; or { enabled: true, componentX: 4, componentY: 4 }
}
```

`resize`/`format` accept everything the sharp API accepts (https://sharp.pixelplumbing.com). The blurhash string is stored on the variant JSON (`variant.blurhash`).

## Video / PDF / document thumbnails

These converters shell out to system binaries (since v5, no npm wrapper packages are needed):

| Converter | Import path | Binaries required |
|---|---|---|
| Video thumbnail | `@jrmc/adonis-attachment/converters/video_thumbnail_converter` | ffmpeg, ffprobe |
| PDF thumbnail | `@jrmc/adonis-attachment/converters/pdf_thumbnail_converter` | poppler (`pdftoppm`, `pdfinfo`) |
| Document thumbnail | `@jrmc/adonis-attachment/converters/document_thumbnail_converter` | LibreOffice (`soffice`) |

```sh
# linux
sudo apt-get install ffmpeg poppler-data poppler-utils
# mac
brew install ffmpeg poppler
```

All three accept the image converter options (`format`, `resize`, ...) to post-process the generated thumbnail:

```ts
preview: {
  converter: () => import('@jrmc/adonis-attachment/converters/pdf_thumbnail_converter'),
  format: 'webp',
  resize: 720,
}
```

Custom binary paths (deployments, precompiled binaries):

```ts
const attachmentConfig = defineConfig({
  bin: {
    ffmpegPath: app.makePath('bin/ffmpeg'),
    ffprobePath: app.makePath('bin/ffprobe'),
    pdftoppmPath: '...',
    pdfinfoPath: '...',
    sofficePath: '...',
  },
  converters: { /* ... */ },
})
```

## Custom converter

```sh
node ace make:converter gif2webp
```

Creates `app/converters/gif_2_webp_converter.ts`. A converter extends the base class and returns a `Buffer` or a file path:

```ts
import type { ConverterAttributes } from '@jrmc/adonis-attachment/types/converter'
import type { Input } from '@jrmc/adonis-attachment/types/input'
import Converter from '@jrmc/adonis-attachment/converters/converter'
import sharp from 'sharp'

export default class Gif2WebpConverter extends Converter {
  async handle({ input }: ConverterAttributes): Promise<Input> {
    return sharp(input, { animated: true, pages: -1 }).webp().toBuffer()
  }
}
```

`this.options` holds the converter config; `this.binPaths` holds the `bin` config. Register it:

```ts
converters: {
  gif: { converter: () => import('#converters/gif_2_webp_converter') },
}
```

## Variant storage paths (v5.1+)

By default variants are stored next to the original: `avatars/image.jpg/thumbnail.webp`.

```ts
const attachmentConfig = defineConfig({
  variant: {
    basePath: 'variants',   // prefix all variants: variants/avatars/image.jpg/thumbnail.webp
    ignoreFolder: true,     // drop the original folder: variants/image.jpg/thumbnail.webp
  },
  converters: { /* ... */ },
})
```

## Queue

Variant generation runs async in a `@poppinss/defer` queue, one task per model attribute. Concurrency (default 1):

```ts
defineConfig({ queue: { concurrency: 2 }, converters: { /* ... */ } })
```

Queue callbacks (in a preload file):

```ts
import { attachmentManager } from '@jrmc/adonis-attachment'

attachmentManager.queue.onError = (error, task) => { /* ... */ }
attachmentManager.queue.taskCompleted = (task) => { /* ... */ }
attachmentManager.queue.drained = () => { /* ... */ }
```

Waiting for completion (tests):

```ts
const notifier = new Promise((resolve) => { attachmentManager.queue.drained = resolve })
// ... save the model ...
await notifier
```

`timeout` config (default 30000 ms) bounds each conversion operation.

## Events (v5.1+)

Emitted via the AdonisJS emitter: `attachment:variant_started`, `attachment:variant_completed`, `attachment:variant_failed`.

```ts
// start/attachment.ts (node ace make:preload attachment)
import emitter from '@adonisjs/core/services/emitter'
import type { AttachmentEventPayload } from '@jrmc/adonis-attachment/types/event'

emitter.on('attachment:variant_failed', (payload: AttachmentEventPayload) => {
  // payload: { tableName, attributeName, primary: { key, value }, variants? }
})
```

## Regenerating variants

`RegenerateService` re-creates variants declared in the model's `variants` option:

```ts
import { inject } from '@adonisjs/core'
import { RegenerateService } from '@jrmc/adonis-attachment'

@inject()
async regenerate(regenerate: RegenerateService) {
  await regenerate.row(user).run()      // one row
  await regenerate.model(User).run()    // whole model

  // filters
  await regenerate.model(User, { variants: ['thumbnail'], attributes: ['avatar'] }).run()
}
```

Typical use: after adding/changing a converter in config, run a regeneration from an ace command or a route.
