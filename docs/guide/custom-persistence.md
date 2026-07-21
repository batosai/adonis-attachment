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

## Enabling jobs and the read route

Variant jobs and the built-in `GET /attachments/:id` route resolve files through an
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
