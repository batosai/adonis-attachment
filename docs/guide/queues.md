# Queues

`AttachmentService.scheduleVariantGeneration` emits a serializable `generate-variants` job. `MemoryAttachmentQueue` is used when no queue is configured.

For an external queue, implement `AttachmentQueue` and dispatch the payload to the chosen worker. The worker calls `AttachmentJobProcessor.process(job)` after resolving its repository and variant generator.

This keeps the package independent from worker deployment while allowing an Adonis queue job to delegate its `execute` method to the processor.

`AdonisAttachmentQueue` adapts an application job class to `AttachmentQueue`:

```ts
import GenerateAttachmentVariants from '#jobs/generate_attachment_variants'
import { AdonisAttachmentQueue } from '@jrmc/adonis-attachment'

const queue = new AdonisAttachmentQueue({
  job: GenerateAttachmentVariants,
  queue: 'attachments',
})
```
