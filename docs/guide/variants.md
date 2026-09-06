# Image variants

A **variant** is a derived file - a thumbnail, a resized image, a reformatted version -
generated from the bytes of an original attachment. The package handles the plumbing
(reading the original, storing the result, and with Lucid, persisting the row).
Built-in converters cover common formats; custom converters are optional.

## Declare converters

Declare converters in `config/attachment.ts`, using the same named, lazy-import format as
v5. The configuration key is the variant key, and the remaining properties are passed to
the converter instance as `options`. When `converter` is omitted, the package uses its
`AutodetectConverter` by default.

```ts
import { defineConfig, LocalFileStorage, type InferConverters } from '@jrmc/adonis-attachment'

const attachmentConfig = defineConfig({
  storage: LocalFileStorage.fromApp,
  converters: {
    thumbnail: {
      resize: { width: 320, fit: 'cover' },
      format: { format: 'webp', options: { quality: 82 } },
    },
  },
})

export default attachmentConfig

declare module '@jrmc/adonis-attachment' {
  interface AttachmentVariants extends InferConverters<typeof attachmentConfig> {}
}
```

## First thumbnail with Lucid

Install `sharp` with `npm install sharp`, then use the configuration above. No converter
class or external queue is required for this image example.

Enable the configured key on your model's relation:

```ts
import { attachment, type AttachmentRelation } from '@jrmc/adonis-attachment/lucid'

@attachment({ variants: ['thumbnail'] })
declare avatar: AttachmentRelation
```

Upload using the [quickstart controller](/guide/getting-started).
Saving the user enqueues generation automatically. The default memory queue processes it
in the application process; completion is not guaranteed when the upload response arrives.

In the action that displays the user, prefer the thumbnail when available:

```ts
const link = await user.avatar.get()
const variants = await user.avatar.variants()
const thumbnail = variants.find((variant) => variant.variantKey === 'thumbnail')
const displayed = thumbnail ?? link?.attachment
const avatarUrl = displayed
  ? `/attachments/${displayed.id}/${encodeURIComponent(displayed.name)}`
  : null

return view.render('users/show', { user, avatarUrl })
```

This uses the public built-in route and the quickstart Edge template. Refresh after
processing to see the thumbnail. Private files need an [authorized route](/guide/serving-files#your-own-protected-route).
If the original remains displayed, inspect queue failures as described in
[Background processing](/guide/queues). To rebuild an existing thumbnail, call
`await user.avatar.regenerateVariants(['thumbnail'])`.

## Custom converter classes

Only generate a class when the autodetected behavior does not meet your needs:

```sh
node ace make:converter thumbnail
```

The generated converter receives the original attachment, its bytes, and the configured
options. It returns the generated file, or `undefined` when this source should not produce
that variant.

```ts
import {
  Converter,
  type ConverterAttributes,
  type ConverterOptions,
} from '@jrmc/adonis-attachment'

type ThumbnailOptions = ConverterOptions & {
  width: number
}

export default class ThumbnailConverter extends Converter<ThumbnailOptions> {
  async handle({ body, options }: ConverterAttributes<ThumbnailOptions>) {
    const { default: sharp } = await import('sharp')
    return {
      body: await sharp(body).rotate().resize({ width: options.width }).webp().toBuffer(),
      fileName: `thumbnail-${String(options.width)}.webp`,
      mimeType: 'image/webp',
    }
  }
}
```

Register this class with `{ converter: () => import('#converters/thumbnail_converter'), width: 320 }`
under your `converters.thumbnail` key. The generated stub initially passes bytes through;
replace its implementation with the conversion above.

## Autodetection

The default converter selects the implementation from the source MIME type:

| Source | Default implementation | Requirement |
| --- | --- | --- |
| `image/*` | Sharp | `sharp` package |
| `video/*` | ffmpeg frame thumbnail | `ffmpeg` executable |
| `application/pdf` | Poppler thumbnail | `pdftoppm` executable |
| Office documents | LibreOffice, then Poppler | `libreoffice` and `pdftoppm` executables |

Set `converter: () => import('#converters/...')` to override this behavior for one key.
The module augmentation also types variant keys in `variants`, `createFrom*` options, and
`regenerateVariants()`. A key not present in this configuration becomes a TypeScript error.

For image inputs, `format` retains the v5 declaration format: use `jpeg`, `jpg`, `png`,
`gif`, `webp`, `avif`, `heif`, `tiff`, or `raw`; formats with Sharp encoder options use
`{ format, options }`. The `resize` object also accepts Sharp's `background`, `kernel`,
`withoutEnlargement`, `withoutReduction`, and `fastShrinkOnLoad` settings.

The image autodetect converter applies `autoOrient: true` unless it is explicitly disabled.
Video thumbnails support only `jpeg`, `png`, and `webp`; PDF and Office thumbnails are
always generated as PNG.

### Video capture time

For an autodetected video converter, `startTime` selects the frame to capture in seconds.
It is passed to ffmpeg as its seek position. When omitted, ffmpeg captures the first frame.

```ts
converters: {
  videoPreview: {
    startTime: 12,
    resize: { width: 640 },
    format: 'webp',
  },
}
```

The direct ffmpeg adapter uses the equivalent `time` option:

```ts
createFfmpegThumbnailConverter({
  key: 'videoPreview',
  time: 12,
  format: 'webp',
})
```

### Blurhash

The v5 `blurhash` converter option is preserved. Install the optional `sharp` and `blurhash`
packages, then enable it for an image-producing converter. The hash is calculated from the
final variant bytes. With Lucid, items returned by `user.avatar.variants()` expose
`variant.blurhash`. The low-level `generateAll()` result exposes `variant.attachment.blurhash`.

```ts
converters: {
  thumbnail: {
    resize: { width: 320, fit: 'cover' },
    format: 'webp',
    blurhash: true,
    // or: blurhash: { enabled: true, componentX: 4, componentY: 4 },
  },
}
```

Blurhash generation is disabled by default. A failure to generate it does not discard the
variant; the variant is persisted without a hash, matching the resilient v5 workflow. This
option works with both the default autodetected converter and an explicit custom converter.

| Image format | Typed encoder options |
| --- | --- |
| `jpeg`, `jpg` | `quality`, `progressive`, `chromaSubsampling`, `mozjpeg`, and JPEG optimization settings |
| `png` | `quality`, `compressionLevel`, `palette`, `effort`, `colours`/`colors`, and `dither` |
| `gif` | `reuse`, `progressive`, palette settings, `loop`, and `delay` |
| `webp` | `quality`, `alphaQuality`, `lossless`, `nearLossless`, `effort`, `loop`, and `delay` |
| `avif`, `heif` | `quality`, `lossless`, `effort`, `chromaSubsampling`, and `bitdepth` |
| `tiff`, `raw` | Use the string form; no package-specific encoder options are declared |

The complete meaning of each encoder option follows the [Sharp output API](https://sharp.pixelplumbing.com/api-output/).

### Typed custom options

An application converter can define and consume its own options. Use `Converter<Options>`
inside the converter, and `ConverterConfig<Options>` to validate its configuration:

```ts
import {
  Converter,
  type ConverterAttributes,
  type ConverterConfig,
  type ConverterOptions,
} from '@jrmc/adonis-attachment'

type WatermarkOptions = ConverterOptions & {
  label: string
  opacity?: number
}

export default class WatermarkConverter extends Converter<WatermarkOptions> {
  async handle({ attachment, body, options }: ConverterAttributes<WatermarkOptions>) {
    return {
      body,
      fileName: `${options.label}-${attachment.name}`,
      mimeType: attachment.mimeType,
    }
  }
}

export const watermark = {
  converter: () => import('#converters/watermark_converter'),
  label: 'My application',
  options: { opacity: 0.5 },
} satisfies ConverterConfig<WatermarkOptions>
```

This example demonstrates option typing only: it renames the output but does not draw a
watermark or use `opacity`. Implement the actual transformation before using it for watermarking.

Declare it in the package configuration with `converters: { watermark }`. Direct properties
and the optional `options` object are merged; properties inside `options` override direct
properties with the same name.

### Direct object converters

You can also provide a `VariantConverter` object directly to `VariantGenerationService`.
It receives the original's bytes and returns the generated file:

### Sharp adapter

Install `sharp`, then use the package adapter to define common resize-and-format variants:

```ts
import sharp from 'sharp'
import { createSharpVariantConverter } from '@jrmc/adonis-attachment/media/sharp'

const thumbnail = createSharpVariantConverter({
  key: 'thumbnail',
  sharp,
  width: 200,
  height: 200,
  resize: { fit: 'cover' },
  format: { format: 'webp', options: { quality: 82 } },
  folder: 'variants',
})
```

### Custom converter

```ts
import type { VariantConverter } from '@jrmc/adonis-attachment'
import sharp from 'sharp'

const thumbnail: VariantConverter = {
  key: 'thumbnail',
  async convert({ body }) {
    const resized = await sharp(body).resize(200, 200, { fit: 'cover' }).webp().toBuffer()

    return {
      body: resized,
      fileName: 'thumbnail.webp',
      mimeType: 'image/webp',
      folder: 'variants',
    }
  },
}
```

### External binaries

The optional binary adapters run executables through an injectable `CommandRunner`, without
using a shell. They create a private temporary directory for each conversion and remove it
afterwards. The default runner executes the command available on `PATH`.

```ts
import {
  createDocumentThumbnailConverter,
  createFfmpegThumbnailConverter,
  createPdfThumbnailConverter,
} from '@jrmc/adonis-attachment/media/binaries'

const videoThumbnail = createFfmpegThumbnailConverter({
  key: 'thumbnail',
  time: 1,
  width: 320,
  format: 'webp',
  command: '/opt/media/bin/ffmpeg',
  timeout: 15_000,
}) // requires ffmpeg

const pdfThumbnail = createPdfThumbnailConverter({
  key: 'thumbnail',
  width: 320,
  command: '/opt/media/bin/pdftoppm',
})
// requires pdftoppm (Poppler)

const documentThumbnail = createDocumentThumbnailConverter({
  key: 'thumbnail',
  width: 320,
  command: '/opt/media/bin/pdftoppm',
  officeCommand: '/opt/media/bin/libreoffice',
})
// requires LibreOffice and pdftoppm
```

Pass `{ runner, command, timeout }` (and `{ officeCommand }` for office documents) to select
custom binary locations, enforce a maximum execution time, or integrate your own process
runner. For autodetected converters, declare the shared paths in
[media binary configuration](/guide/configuration#media-binaries); a converter-level command
or timeout overrides that shared value.

## Generate them

`VariantGenerationService` reads the original and writes each generated file. On its own,
it produces `Attachment` values but doesn't record them anywhere.

```ts
import { VariantGenerationService, attachmentConverters, attachmentService } from '@jrmc/adonis-attachment'

const generator = new VariantGenerationService({
  attachments: attachmentService, // the jrmc.attachment service
  converters: attachmentConverters,
})
```

The automatic Lucid workflow above already handles this wiring. For custom low-level
orchestration with **Lucid**, wrap it so each variant becomes a row in the `adonis_attachments` table
(`parent_id` pointing at the original blob):

```ts
import { LucidVariantGenerationService, LucidAttachmentStore } from '@jrmc/adonis-attachment/lucid'

const variants = new LucidVariantGenerationService({
  generator,
  attachments: attachmentService,
  store: new LucidAttachmentStore(),
})
```

## Trigger generation

With a Lucid relation, list variant keys in the decorator or in `defaults` to enqueue them
automatically after the blob and link are committed. Per-call manager options take priority
over decorator and configuration options:

```ts
import { attachment, type AttachmentRelation } from '@jrmc/adonis-attachment/lucid'

@attachment({ variants: ['thumbnail'] })
declare avatar: AttachmentRelation

user.avatar.set(draft)
await user.save() // enqueues "thumbnail" after a successful commit
```

You can also trigger selected variants manually after the original is saved:

```ts
user.avatar.set(draft)
await user.save()
await user.avatar.regenerateVariants(['thumbnail']) // enqueues a job
```

Under the hood this calls `AttachmentService.scheduleVariantGeneration`, which puts a
`generate-variants` job on the queue. A worker then resolves the original and runs your
converters. See [Background processing](/guide/queues) to choose how that job runs.

## Behavior and errors

If one conversion fails, generation waits for the other conversions to settle and removes
all files created by that failed batch. With Lucid, a database insertion failure removes
the failed variant and any remaining unpersisted outputs; variants already saved remain
available. Cleanup failures are reported alongside the original error in an `AggregateError`.
Custom services passed to `VariantGenerationService` must implement `remove` as well as
`create` and `read` so failed batches can be cleaned up.

- If persisting a generated variant fails, its freshly written file is **deleted**, so no
  orphan files are left behind.
- Requesting a key with no matching converter raises `UnknownVariantConverterError`.
- Variants attach to the **blob**, not to a particular owner, so a reused blob shares its
  variants across every record that links to it.

**Next:** [Serving files](/guide/serving-files).
