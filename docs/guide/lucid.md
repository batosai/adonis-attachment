# Lucid

Lucid is optional. When enabled, attachments and variants are stored in one polymorphic table. A variant references its original attachment through `parent_id`.

Create the migration:

```sh
node ace make:attachments-table
```

Use `--table=media_attachments` or `--folder=database/migrations` to customize the generated file.

`AttachmentModel` maps the default table and can be extended by the application. It keeps application-assigned UUIDs, serializes `metadata`, and automatically maintains `created_at` and `updated_at`, matching the generated migration. The table enforces one original attachment per `{ type, id, field }` owner. `LucidAttachmentStore` creates original and variant rows; `LucidAttachmentRepository` lets a queued worker resolve an attachment by id.

Read an owner field together with its generated variants through the same store:

```ts
const attachment = await new LucidAttachmentStore().findByOwner({
  type: 'users',
  id: user.id,
  field: 'avatar',
})

if (attachment) {
  attachment.original.toAttachment()
  attachment.variants.map((variant) => variant.toAttachment())
}
```

## Attachment lifecycle

`LucidAttachmentLifecycleService` coordinates storage and persistence. It writes the file first, then creates its polymorphic row. If the database operation fails, it removes the new file as compensation.

```ts
import {
  LucidAttachmentLifecycleService,
  LucidAttachmentStore,
} from '@jrmc/adonis-attachment/lucid'
import attachmentService from '#services/attachment_service'

const lifecycle = new LucidAttachmentLifecycleService(
  attachmentService,
  new LucidAttachmentStore()
)

await lifecycle.attach(
  { type: 'users', id: user.id, field: 'avatar' },
  { body: fileBytes, originalName: 'profile.jpg', mimeType: 'image/jpeg' }
)
```

`replace` keeps the previous row until the replacement is persisted, transferring its internal owner key just before insertion. It restores that key when persistence fails. `detach` removes the original, its variants, and their files. External storage cannot participate in a SQL transaction, so applications should monitor failed file cleanup and retry it when necessary.
