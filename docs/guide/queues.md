# Queues

`AttachmentService.scheduleVariantGeneration` emits a serializable `generate-variants` job. `MemoryAttachmentQueue` is used when no queue is configured.

For an external queue, implement `AttachmentQueue` and dispatch the payload to the chosen worker. The worker calls `AttachmentJobProcessor.process(job)` after resolving its repository and variant generator.

This keeps the package independent from worker deployment while allowing an Adonis queue job to delegate its `execute` method to the processor.

`AttachmentJobProcessor` also accepts an asynchronous variant-generator factory. This resolves the generator on the first job and avoids a circular dependency when the generator itself needs `jrmc.attachment` from the Adonis container:

```ts
const processor = new AttachmentJobProcessor({
  attachments: new LucidAttachmentRepository(),
  async variants() {
    const attachments = await app.container.make('jrmc.attachment')

    return new LucidVariantGenerationService({
      attachments,
      generator: new VariantGenerationService({ attachments, converters }),
      store: new LucidAttachmentStore(),
    })
  },
})
```

## Memory queue

Pass `processor` to `defineConfig` to execute jobs in-process. This is the default queue implementation and is suitable for simple deployments or tests.

```ts
export default defineConfig({
  storage: AdonisDriveStorage.fromApp,
  processor: attachmentProcessor,
})
```

`AdonisAttachmentQueue` adapts an application job class to `AttachmentQueue`:

```ts
import GenerateAttachmentVariants from '#jobs/generate_attachment_variants'
import { AdonisAttachmentQueue } from '@jrmc/adonis-attachment'

const queue = new AdonisAttachmentQueue({
  job: GenerateAttachmentVariants,
  queue: 'attachments',
})
```

The application job owns dependency injection and delegates its payload to the processor:

```ts
import { Job } from '@adonisjs/queue'
import type { AttachmentJob } from '@jrmc/adonis-attachment'
import attachmentProcessor from '#services/attachment_processor'

export default class GenerateAttachmentVariants extends Job<AttachmentJob> {
  async execute() {
    await attachmentProcessor.process(this.payload)
  }
}
```
