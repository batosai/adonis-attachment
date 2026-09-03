# Events

The package emits attachment lifecycle events through the AdonisJS emitter. They are
observational: an exception raised by a listener never rolls back a file operation or
fails a queue job.

The package provider supplies the Adonis emitter automatically. An
`AttachmentJobProcessor` also resolves that emitter lazily when it runs inside a booted
Adonis application. Declare `events` only when you need to replace the emitter; the
configured emitter is then injected into the processor by `defineConfig`.

## Variant events

These three event names and their Lucid fields are retained from v5:

| Event | When it is emitted |
| --- | --- |
| `attachment:variant_started` | A worker starts generating variants. |
| `attachment:variant_completed` | All requested variants have been generated. |
| `attachment:variant_failed` | Variant generation fails. |

```ts
import emitter from '@adonisjs/core/services/emitter'
import type { AttachmentEventPayload } from '@jrmc/adonis-attachment'

emitter.on('attachment:variant_completed', (payload: AttachmentEventPayload) => {
  console.log(payload.attachment.id)
  console.log(payload.variants)
})

emitter.on('attachment:variant_failed', (payload: AttachmentEventPayload) => {
  console.error(payload.error?.code, payload.error?.message)
})
```

For a Lucid relation, the payload keeps the v5 identifiers:

```ts
type AttachmentEventPayload = {
  attachment: Attachment
  variants?: readonly string[]
  tableName?: string
  attributeName?: string
  primary?: {
    key: string
    value: string | number
  }
  error?: {
    message: string
    code?: string
  }
}
```

`tableName`, `attributeName`, and `primary` are undefined outside a Lucid relation. Use
`attachment.id` as the common identifier in application code. The `error` field is only
present on `attachment:variant_failed`; it is new in v6 and does not break v5 listeners.

## File and metadata events

The following events complete the lifecycle API:

| Event | When it is emitted |
| --- | --- |
| `attachment:created` | The file has been written to its configured storage. |
| `attachment:deleted` | The file has been removed from storage. |
| `attachment:metadata_started` | Metadata extraction starts. |
| `attachment:metadata_completed` | Metadata extraction completes. |
| `attachment:metadata_failed` | Metadata extraction fails. |

Synchronous metadata emits these events during `draft.persist()`. Deferred metadata emits
them in the worker processing `extract-metadata` jobs. A failed metadata event exposes the
same structured `error` object as a failed variant event.

## Workers and external queues

Variant and deferred-metadata events occur where the job executes. Declare an adapter in
the attachment configuration to replace the default Adonis emitter; `defineConfig` gives it
to the configured or automatically created Lucid processor. A separate `@adonisjs/queue`
worker must give the same adapter to its own processor.

```ts
import emitter from '@adonisjs/core/services/emitter'
import {
  AttachmentJobProcessor,
  defineConfig,
} from '@jrmc/adonis-attachment'
import { AdonisAttachmentEventEmitter } from '@jrmc/adonis-attachment/events/adonis'

const events = new AdonisAttachmentEventEmitter(emitter)

const processor = new AttachmentJobProcessor({
  attachments: attachmentRepository,
  variants: attachmentVariants,
})

export default defineConfig({
  storage: attachmentStorage,
  processor,
  events,
})
```

For a Lucid relation, the scheduling layer stores its v5 context in the job payload. It is
therefore available even when the worker runs in another process.
