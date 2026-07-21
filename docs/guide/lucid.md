# Lucid

Lucid is optional. When enabled, file blobs are stored in `attachments`, while polymorphic owner links are stored in `attachment_links`. A variant is a blob whose `parent_id` references its original blob.

## JSON single attachment column

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

## Polymorphic table relations

`@attachmentRelation()` exposes one attachment through a model property backed by the `attachment_links` table. Unlike `@attachment()`, the property is not a JSON column and the parent model must already be persisted.

```ts
import {
  attachmentManager,
  attachmentRelation,
  type AttachmentRelation,
} from "@jrmc/adonis-attachment";
import { BaseModel, column } from "@adonisjs/lucid/orm";

export default class User extends BaseModel {
  static table = "users";

  @column({ isPrimary: true })
  declare id: string;

  @attachmentRelation({
    folder: ({ model }) => `users/${model?.id}/avatar`,
    rename: false,
  })
  declare avatar: AttachmentRelation;
}

const draft = await attachmentManager.createFromBase64(base64, {
  originalName: "avatar.png",
  mimeType: "image/png",
});

await user.avatar.attach(draft);
```

The singular relation provides these commands:

- `get()` returns the persisted `AttachmentLinkModel` or `null`. Its `attachment` property is the blob and `toAttachment()` returns the core file value.
- `attach(draft)` creates the first attachment and throws when one is already attached. This prevents an accidental replacement.
- `attachExisting(blobId)` creates a link to an already persisted blob without copying its file.
- `set(draft)` and `replace(draft)` create an attachment when empty or replace the current one. The previous file is removed only after the replacement row exists.
- `detach()` removes the original, its variants, and their files.
- `variants()` returns persisted variant rows. `regenerateVariants(keys?)` enqueues generation and returns `false` when no original is attached.

The polymorphic type defaults to the Lucid model `static table`. Set `type` in the decorator when an application needs a stable custom type instead:

```ts
@attachmentRelation({ type: "user" })
declare avatar: AttachmentRelation;
```

### Ordered collections

`@attachmentsRelation()` exposes several attachments for one model property. The generated `attachment_links` table stores each item with a nullable `owner_key` and a `position`; the singular relation uses `owner_key`, while collection rows leave it empty.

```ts
import {
  attachmentsRelation,
  type AttachmentCollectionRelation,
} from "@jrmc/adonis-attachment";

export default class Post extends BaseModel {
  static table = "posts";

  @column({ isPrimary: true })
  declare id: string;

  @attachmentsRelation({
    folder: ({ model }) => `posts/${model?.id}/gallery`,
    rename: false,
  })
  declare gallery: AttachmentCollectionRelation;
}

const first = await attachmentManager.createFromFile(request.file("image"), {
  originalName: "first.jpg",
});
const second = await attachmentManager.createFromFile(request.file("image"), {
  originalName: "second.jpg",
});

await post.gallery.add(first);
await post.gallery.add(second, 0);
await post.gallery.move(second.id, 0);
```

Collection commands are `all()`, `add(draft, position?)`, `addExisting(blobId, position?)`, `remove(id)`, `clear()`, `replaceAll(drafts)`, and `move(id, position)`. `add` appends by default; positions are zero-based and normalized after a remove or move. `remove` returns `false` when the id is not part of this model collection. The `id` handled by `move` and `remove` is the link id returned by `add`, while `attachmentId` identifies the reusable blob.

Both relation decorators receive the same persistence options as `@attachment()`. Per setting, the priority is: options passed to `attachmentManager.createFrom*`, then the relation decorator, then `defaults` in `config/attachment.ts`. Relation folder and rename callbacks receive `{ model, field, originalName }` at persistence time.

When the model uses a Lucid transaction, relation commands use the same transaction for attachment rows. Files newly written by `attach`, `set`, `replace`, or `add` are removed on rollback. File removals caused by `detach`, `replace`, `remove`, `clear`, or `replaceAll` are deferred until commit, so a rollback retains the previous files.

Create the migration:

```sh
node ace make:attachments-table
```

Use `--table=media_attachments` or `--folder=database/migrations` to customize the generated file.

`AttachmentModel` maps the default blob table and can be extended by the application. It keeps application-assigned UUIDs, serializes `metadata`, and automatically maintains `created_at` and `updated_at`. `AttachmentLinkModel` maps the polymorphic owner table. It enforces one singular link per `{ type, id, field }` owner and carries collection positions. `LucidAttachmentStore` creates blobs, links, and variants; `LucidAttachmentRepository` resolves a blob by id for queued workers and the read route.

Deleting a model with relation decorators removes all of its links automatically. A blob, its variants, and their files are purged only after its last link is removed, so the model supports a future shared-blob workflow safely.

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

`LucidAttachmentLifecycleService` coordinates storage and persistence. It accepts either a source input or an `AttachmentDraft`, writes the file first, then creates its blob and polymorphic link. If a database operation fails, it removes the new file as compensation.

```ts
import {
  LucidAttachmentLifecycleService,
  LucidAttachmentStore,
} from "@jrmc/adonis-attachment/lucid";
import { attachmentManager } from "@jrmc/adonis-attachment";
import attachmentService from "#services/attachment_service";

const lifecycle = new LucidAttachmentLifecycleService(
  attachmentService,
  new LucidAttachmentStore(),
);

const draft = await attachmentManager.createFromBuffer(fileBytes, {
  originalName: "profile.jpg",
  folder: `users/${user.id}`,
});

const avatar = await lifecycle.attach(
  { type: "users", id: user.id, field: "avatar" },
  draft,
);

await attachmentService.scheduleVariantGeneration(avatar.toAttachment(), [
  "thumbnail",
]);
```

Schedule variants after `attach` or `replace` returns, so a worker can resolve the persisted original. `replace` keeps the previous row until the replacement is persisted, transferring its internal owner key just before insertion. It restores that key when persistence fails. `detach` removes the original, its variants, and their files. External storage cannot participate in a SQL transaction, so applications should monitor failed file cleanup and retry it when necessary.
