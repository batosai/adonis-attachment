# With another data store

Lucid is optional. If you use Prisma, Kysely, MikroORM, raw SQL - or no ORM at all - you
can persist attachments yourself. The pattern is always the same:

1. Create a draft.
2. `persist()` it (writes the file, returns the final `Attachment`).
3. Store the fields you care about in your own schema.

```ts
import { attachmentManager } from '@jrmc/adonis-attachment'

const attachment = await attachmentManager.createFromBuffer(fileBytes, {
  originalName: 'profile.jpg',
  mimeType: 'image/jpeg',
  folder: `users/${user.id}`,
})

await attachment.persist()

await database.userMedia.create({
  data: {
    userId: user.id,
    attachmentId: attachment.id,
    disk: attachment.disk,
    path: attachment.path,
    name: attachment.name,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    extname: attachment.extname,
    size: attachment.size,
  },
})
```

Keep at least the `id`, `disk`, and `path` - the rest is metadata you store as needed. The
package imposes no schema and no relationship model.

::: tip Reading the file back
Rebuild an `Attachment`-shaped object from your columns and pass it to
`AttachmentService.read(attachment)` to get the bytes.
:::

## Deferred metadata

Metadata extraction does not require Lucid. In deferred mode, another ORM needs three pieces:

1. An `AttachmentMetadataPersister` that updates its own record.
2. A queue handler that processes `extract-metadata` jobs.
3. A call to `scheduleMetadataExtraction()` after the attachment record commits.

The default in-memory queue is enough for local development and small applications. This
configuration uses it to extract metadata outside the upload operation:

```ts
// config/attachment.ts
import {
  defineConfig,
  LocalFileStorage,
  type AttachmentMetadataPersister,
} from '@jrmc/adonis-attachment'

const metadataPersister: AttachmentMetadataPersister = {
  async persistMetadata(attachment, metadata) {
    await database.userMedia.update({
      where: { attachmentId: attachment.id },
      data: { metadata },
    })
  },
}

export default defineConfig({
  storage: LocalFileStorage.fromApp,
  media: {
    metadataPolicy: { mode: 'deferred' },
    metadataPersister,
  },
  jobHandler: (app) => async (job) => {
    if (job.type !== 'extract-metadata') return

    const attachments = await app.container.make('jrmc.attachment')
    await attachments.extractAndPersistMetadata(job.attachment)
  },
})
```

Enable metadata on the draft, persist the attachment record in your ORM, and enqueue extraction
only after the transaction succeeds:

```ts
import app from '@adonisjs/core/services/app'
import { attachmentManager } from '@jrmc/adonis-attachment'

const draft = await attachmentManager.createFromBuffer(fileBytes, {
  originalName: 'profile.jpg',
  mimeType: 'image/jpeg',
  meta: true,
})
const attachment = await draft.persist()

await database.transaction(async (transaction) => {
  await transaction.userMedia.create({
    data: {
      attachmentId: attachment.id,
      disk: attachment.disk,
      path: attachment.path,
      name: attachment.name,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      extname: attachment.extname,
      size: attachment.size,
    },
  })
})

const attachments = await app.container.make('jrmc.attachment')
await attachments.scheduleMetadataExtraction(attachment)
```

The attachment is usable immediately; its `metadata` column is populated when the job finishes.
For a durable production worker, replace the in-memory queue with the
[Adonis Queue adapter](/guide/queues#a-real-worker-with-adonisjsqueue). The same persister and
post-commit scheduling rule apply. If the application also generates variants, route those jobs
through the full `AttachmentJobProcessor` shown in the background-processing guide instead of
ignoring non-metadata jobs.

## Enabling jobs and the read route

Variant jobs and the built-in `GET /attachments/:id/:name?` route resolve files through an
**`AttachmentRepository`**. Implement it against your data store:

```ts
import type { AttachmentRepository } from '@jrmc/adonis-attachment'

export class UserMediaRepository implements AttachmentRepository {
  async findById(id: string) {
    const media = await database.userMedia.findUnique({ where: { attachmentId: id } })
    if (!media) return null

    return {
      id: media.attachmentId,
      disk: media.disk,
      path: media.path,
      name: media.name,
      originalName: media.originalName,
      mimeType: media.mimeType,
      extname: media.extname,
      size: media.size,
    }
  }
}
```

Then pass it to `defineConfig`:

```ts
export default defineConfig({
  storage: LocalFileStorage.fromApp,
  repository: new UserMediaRepository(),
})
```

Variant **persistence** stays application-owned in this mode - you decide how to record the
generated variants (the Lucid integration is what automates variant rows for you).

**Next:** [Serving files](/guide/serving-files) · [Background processing](/guide/queues).
