# Media and worker recipes

## Automatic variants

```ts
import { defineConfig, LocalFileStorage, type InferConverters } from '@jrmc/adonis-attachment'

const config = defineConfig({
  storage: LocalFileStorage.fromApp,
  converters: {
    thumbnail: {
      resize: { width: 320, fit: 'cover' },
      format: { format: 'webp', options: { quality: 82 } },
      autoOrient: true,
      blurhash: true,
    },
  },
})
export default config
declare module '@jrmc/adonis-attachment' {
  interface AttachmentVariants extends InferConverters<typeof config> {}
}
```

Merge this into the application's existing config and augmentation. Install `sharp` for
image conversion and `blurhash` if enabled. Enable the key with
`@attachment({ variants: ['thumbnail'] })` on an `AttachmentRelation` imported from `/lucid`,
or in `defaults.variants`, or in manager source options (highest priority).
After `user.avatar.set(draft); await user.save()`, read `await user.avatar.variants()`.
Those are blob models; find by `.variantKey`, read `.blurhash`, and build a URL from `.id`.
Fall back to the original from `(await user.avatar.get())?.attachment` while processing.
Only use the built-in `/attachments/:id/:name?` route for public files.

Autodetect chooses Sharp for image inputs, ffmpeg for videos, Poppler for PDFs, and
LibreOffice then Poppler for Office documents. Image auto-orientation defaults to true.
For a video frame use converter `startTime: 12` (seconds); the direct ffmpeg adapter uses
`time: 12`. Video output is jpeg/png/webp; PDF and Office thumbnails are PNG.
Formats and encoder options are typed. Keep the application's `InferConverters` augmentation
so converter keys remain typed in source options, decorators, and regeneration.

## Metadata and binaries

Set `meta: true` in manager options, the relation decorator, or `defaults`. No custom
`media.metadata` array is needed for the built-in profile:

- Image technical fields: install `sharp`; SVG is included and bypasses EXIF.
- Image EXIF/GPS: install `exifreader`. Expanded GPS is normalized automatically.
- Audio/video metadata: `ffprobe`. PDF metadata: `pdfinfo`.
- DOCX: stored without extracted metadata; not an error on its own.

Available fields include dimension, orientation, date, host, gps, duration, videoCodec,
audioCodec, pages, version, bitRate, format, density, hasAlpha, and pageHeight, depending
on the source. Known `metadata` supplied by the application wins over extracted fields.
Extractors run in order and merge top-level fields. Dependencies load only for matching inputs.

Shared paths belong in `media.binaries`: keys are `ffmpeg`, `ffprobe`, `pdftoppm`, `pdfinfo`,
and `soffice`, each with `{ command, timeout? }`. Commands can be names on PATH or absolute
paths. Keep `timeout` in milliseconds. Do not use v5's global `bin` keys.
For autodetect, per-converter commands/timeouts override shared binary settings.

Metadata is synchronous by default: catch failures around `draft.persist()` or `user.save()`.
For deferred extraction set `media.metadataPolicy: { mode: 'deferred' }`; Lucid schedules
after commit. `metadataPolicy.variants: false` disables variant extraction only.
Outside Lucid, supply a metadata persister and processor and schedule after your row commits.

`media.metadata` replaces the whole profile. Customize only when needed using
`createDefaultMetadataExtractors` from `/media/metadata`; options `sharp`, `exif`, `ffprobe`,
and `pdfinfo` accept false to disable that extractor. `createSharpMetadataExtractor(sharp)`
from `/media/sharp` accepts the real imported Sharp function without a double cast.

## Custom converters

Run `node ace make:converter thumbnail` only when custom code is required. The generated
stub is initially pass-through: changing MIME or extension alone is not conversion.

```ts
import { Converter, type ConverterAttributes } from '@jrmc/adonis-attachment'
import sharp from 'sharp'

export default class ThumbnailConverter extends Converter {
  async handle({ body }: ConverterAttributes) {
    return {
      body: await sharp(Buffer.from(body)).rotate().resize(320).webp().toBuffer(),
      fileName: 'thumbnail.webp',
      mimeType: 'image/webp',
    }
  }
}
```

Register with `converter: () => import('#converters/thumbnail_converter')` under a named
converter key. `Converter` is a named root export, not the root default export. A handler
receives `{ attachment, body, options }`, returns output bytes with filename/MIME, or undefined
to skip. Use `Converter<CustomOptions>` and `ConverterConfig<CustomOptions>` for typed options.

## Connections and workers

Add `ATTACHMENT_QUEUE: Env.schema.enum.optional(['memory', 'background'] as const)` to the
existing `start/env.ts` schema. Import `env` from `#start/env` in attachment config, then set
`queue.default: env.get('ATTACHMENT_QUEUE', 'memory')`. Declare `connections.memory` with
`{ driver: 'memory', concurrency: 1, onFailure(job, error) { console.error(job.type, error) } }`.
Default must match a connection key; unknown names fail boot rather than silently falling back.

An external connection is `{ driver: 'adonis', job: GenerateAttachmentVariants,
queueName: 'attachments' }`. The connection name `background` is distinct from the native
queue destination. Only the selected connection is initialized, but top-level JS imports
still run. Use an async connection factory with a dynamic job import returning
`new AdonisAttachmentQueue(...)` to defer optional dependencies.

Configure `@adonisjs/queue` first, create the forwarding job with
`node ace make:job generate_attachment_variants`, and forward its `AttachmentJob` payload:

```ts
import app from '@adonisjs/core/services/app'
import { Job } from '@adonisjs/queue'
import type { AttachmentJob } from '@jrmc/adonis-attachment'
import { createLucidAttachmentProcessor } from '@jrmc/adonis-attachment/lucid'

const processor = createLucidAttachmentProcessor(app)
export default class GenerateAttachmentVariants extends Job<AttachmentJob> {
  async execute() {
    await processor.process(this.payload)
  }
}
```

Run `node ace queue:work --queue=attachments`. Worker database/storage access and media
dependencies must match the application. A native `Job.options.queue` takes precedence
over Attachment's `queueName`. The default memory driver automatically wires Lucid processing;
external workers need the factory above. Direct queue instances/factories own their handlers.

Without Lucid, use an application repository and a variant-persistence wrapper with
`AttachmentJobProcessor`. Persist `VariantGenerationService.generateAll()` results; rollback
must clean new files, and regeneration must replace rows and clean old files after commit.
Resolve the full service for that generator with `await app.container.make('jrmc.attachment')`;
the root `attachmentService` facade only exposes URL methods, not create/read/remove.
`processor` or `jobHandler` overrides automatic memory processing.

## Regeneration, events, and diagnosis

`await user.avatar.regenerateVariants(['thumbnail'])` enqueues replacement from the original.
`await post.gallery.regenerateVariants()` covers all persisted collection items. For a
model-wide operation use `new AttachmentRegenerator().model(User, { attributes: ['avatar'],
variants: ['thumbnail'], batchSize: 100, concurrency: 5 }).run()` from `/lucid`.
It enqueues jobs; it does not wait for conversions to finish.

Listen through the Adonis emitter for `attachment:variant_started/completed/failed`,
`attachment:metadata_started/completed/failed`, and `attachment:created/deleted` (expand
the slash shorthand into individual event names). `AttachmentEventPayload` is exported
from the package root. Listeners are observational: their failures do not roll back file work.

Check failures where work executes: sync persistence catch, memory connection `onFailure`,
or external worker logs. Without `onFailure`, memory job failures are silent; drain does
not rethrow them. Unsupported input and absent metadata differ from corrupt input, missing
packages, binary failures, or missing workers. A SVG must never be passed to EXIF.
