# Lucid

Lucid is optional. When enabled, attachments and variants are stored in one polymorphic table. A variant references its original attachment through `parent_id`.

## Single attachment column

For a single attachment, an application may keep a JSON column on its Lucid model. The `@attachment()` decorator preserves the v5 assignment workflow while tracking file cleanup.

Declare the column as JSON in its migration:

```ts
table.json("avatar").nullable();
```

```ts
import {
  attachment,
  attachmentManager,
  type Attachment,
} from "@jrmc/adonis-attachment";
import { BaseModel, column } from "@adonisjs/lucid/orm";

export default class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: string;

  @attachment({
    folder: ({ model }) => `users/${model?.id}`,
  })
  declare avatar: Attachment | null;
}

const attachment = await attachmentManager.createFromBase64(base64, {
  originalName: "avatar.png",
  mimeType: "image/png",
});

user.avatar = attachment;
await user.save();
```

The decorator persists a draft automatically during `save()`, after resolving its own options and the model context. Do not call `persist()` manually for this workflow. It serializes the persisted value as JSON. When a save fails, it removes a newly created attachment; when a replacement succeeds, it removes the former file. Deleting the model also removes its attachment. This mode supports one attachment per column. Use the polymorphic table for collections, persisted variants, queues, and the built-in read route.

Create the migration:

```sh
node ace make:attachments-table
```

Use `--table=media_attachments` or `--folder=database/migrations` to customize the generated file.

`AttachmentModel` maps the default table and can be extended by the application. It keeps application-assigned UUIDs, serializes `metadata`, and automatically maintains `created_at` and `updated_at`, matching the generated migration. The table enforces one original attachment per `{ type, id, field }` owner. `LucidAttachmentStore` creates original and variant rows; `LucidAttachmentRepository` lets a queued worker resolve an attachment by id.

Read an owner field together with its generated variants through the same store:

```ts
const attachment = await new LucidAttachmentStore().findByOwner({
  type: "users",
  id: user.id,
  field: "avatar",
});

if (attachment) {
  attachment.original.toAttachment();
  attachment.variants.map((variant) => variant.toAttachment());
}
```

## Attachment lifecycle

`LucidAttachmentLifecycleService` coordinates storage and persistence. It accepts either a source input or an `AttachmentDraft`, writes the file first, then creates its polymorphic row. If the database operation fails, it removes the new file as compensation.

```ts
import {
  LucidAttachmentLifecycleService,
  LucidAttachmentStore,
} from "@jrmc/adonis-attachment/lucid";
import attachmentService from "#services/attachment_service";

const lifecycle = new LucidAttachmentLifecycleService(
  attachmentService,
  new LucidAttachmentStore(),
);

const avatar = await lifecycle.attach(
  { type: "users", id: user.id, field: "avatar" },
  { body: fileBytes, originalName: "profile.jpg", mimeType: "image/jpeg" },
);

await attachmentService.scheduleVariantGeneration(avatar.toAttachment(), [
  "thumbnail",
]);
```

Schedule variants after `attach` or `replace` returns, so a worker can resolve the persisted original. `replace` keeps the previous row until the replacement is persisted, transferring its internal owner key just before insertion. It restores that key when persistence fails. `detach` removes the original, its variants, and their files. External storage cannot participate in a SQL transaction, so applications should monitor failed file cleanup and retry it when necessary.
