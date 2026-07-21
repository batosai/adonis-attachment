# Image variants

A **variant** is a derived file - a thumbnail, a resized image, a reformatted version -
generated from the bytes of an original attachment. The package handles the plumbing
(reading the original, storing the result, persisting the row); **you provide the
transformation**.

## Declare converters

Declare converters in `config/attachment.ts`, using the same named, lazy-import format as
v5. The configuration key is the variant key, and the remaining properties are passed to
the converter instance as `options`.

```ts
export default defineConfig({
  storage: LocalFileStorage.fromApp,
  converters: {
    thumbnail: {
      converter: () => import('#converters/thumbnail_converter'),
      width: 320,
      format: 'webp',
    },
  },
})
```

Generate the class with:

```sh
node ace make:converter thumbnail
```

The generated converter receives the original attachment, its bytes, and the configured
options. It returns the generated file, or `undefined` when this source should not produce
that variant.

```ts
import Converter, { type ConverterAttributes } from '@jrmc/adonis-attachment'

export default class ThumbnailConverter extends Converter {
  async handle({ attachment, body, options }: ConverterAttributes) {
    return {
      body,
      fileName: `thumbnail-${String(options.width)}.webp`,
      mimeType: 'image/webp',
    }
  }
}
```

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
  format: 'webp',
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
}) // requires ffmpeg

const pdfThumbnail = createPdfThumbnailConverter({ key: 'thumbnail', width: 320 })
// requires pdftoppm (Poppler)

const documentThumbnail = createDocumentThumbnailConverter({ key: 'thumbnail', width: 320 })
// requires LibreOffice and pdftoppm
```

Pass `{ runner, command }` (and `{ officeCommand }` for office documents) to select custom
binary locations or to integrate your own process runner.

## Generate them

`VariantGenerationService` reads the original and writes each generated file. On its own,
it produces `Attachment` values but doesn't record them anywhere.

```ts
import { VariantGenerationService, attachmentConverters } from '@jrmc/adonis-attachment'

const generator = new VariantGenerationService({
  attachments: attachmentService, // the jrmc.attachment service
  converters: attachmentConverters,
})
```

With **Lucid**, wrap it so each variant becomes a row in the `attachments` table
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
@attachmentRelation({ variants: ['thumbnail'] })
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

- If persisting a generated variant fails, its freshly written file is **deleted**, so no
  orphan files are left behind.
- Requesting a key with no matching converter raises `UnknownVariantConverterError`.
- Variants attach to the **blob**, not to a particular owner, so a reused blob shares its
  variants across every record that links to it.

**Next:** [Serving files](/guide/serving-files).
