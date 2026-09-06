# Storing with Lucid

The Lucid integration is optional, but it's the most convenient way to tie files to your
records. Attachments are represented by polymorphic relations backed by the package tables.

It also exports `createLucidAttachmentProcessor` for external queue workers. The default
in-memory queue creates this processor automatically; see
[Background processing](/guide/queues#creating-the-lucid-processor-for-a-worker).

Use `@attachment()` for one file and `@attachments()` for an ordered collection.
`@attachmentRelation()` and `@attachmentsRelation()` remain available as equivalent,
explicit names.

## Set up the tables

```sh
node ace make:attachments-table
node ace migration:run
```

This creates two tables (see [Core concepts](/guide/concepts#the-blob-vs-link-split-lucid)):

- **`attachments`** - the blobs (file data). Holds originals *and* variants
  (`parent_id` / `variant_key`).
- **`attachment_links`** - the polymorphic links (`attachable_type`, `attachable_id`,
  `field`, `owner_key`, `position`, `attachment_id`).

## Single attachment - `@attachment`

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { attachment, type AttachmentRelation } from '@jrmc/adonis-attachment/lucid'

export default class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @attachment({
    folder: ({ model }) => `users/${model?.id}/avatar`,
    rename: false,
  })
  declare avatar: AttachmentRelation
}
```

`avatar` is a relation accessor, not a column. Its **mutations are staged** and applied
when you `save()` the model (or when you call `await avatar.persist()`). Reads stay async.

| Method | Does |
| --- | --- |
| `get()` | Reads the linked `AttachmentLinkModel` (blob preloaded) or `null`. Async. |
| `attach(draft)` | Stages the first attachment. Throws on flush if one already exists. |
| `set(draft)` / `replace(draft)` | Stages an attachment, or a replacement of the current one. |
| `attachExisting(id)` | Stages a link to an **existing blob** (reuse, no new file). |
| `detach()` | Stages removal of the original, its variants, and their files. |
| `persist()` | Flushes the staged mutation now and returns the link (or `null` after detach). Async. |
| `variants()` | Reads the persisted variants of the current original. Async. |
| `regenerateVariants(keys?)` | Enqueues replacement generation. Existing variants with the same key are updated; returns `false` if nothing is attached. |

```ts
const draft = await attachmentManager.createFromFile(request.file('avatar')!)

user.avatar.set(draft) // stage the change
await user.save()      // flush: file written, blob + link rows created

// Read it back, then stage a removal
const link = await user.avatar.get()
user.avatar.detach()
await user.save()
```

::: info Staged, then flushed
Relation mutations are staged on the model and applied only after `save()` succeeds - so
you can even stage an attachment before the record exists, and it is written once the
insert completes. To flush without a full `save()`, call `await user.avatar.persist()`;
that path does require an already persisted owner. If `save()` fails, no file or relation
row is written and the staged mutation remains available for a later retry.
:::

### Custom polymorphic type

The link's `attachable_type` defaults to the model's `static table`. Pin a stable value if
you rename tables:

```ts
@attachment({ type: 'user' })
declare avatar: AttachmentRelation
```

### Paths from model attributes

String `folder` and custom `rename` values support V5-style `:attribute` parameters. The
value is read from the model, then lowercased and slugified before insertion. Only string
attributes are substituted; an unknown or non-string parameter stays unchanged.

```ts
@attachment({
  folder: 'uploads/:name/avatars',
  rename: () => ':name-avatar.jpg',
})
declare avatar: AttachmentRelation
```

For `name = 'Jane Doe'`, this writes to
`uploads/jane-doe/avatars/jane-doe-avatar.jpg`. Attachments are staged until after the owner
is saved, so an auto-increment `:id` is available when paths are resolved.

### Public URLs

Enable `preComputeUrl` to resolve a public URL when `get()`, `all()`, or `variants()` reads
the relation. The URL is kept in memory on the loaded attachment model and is never stored:

```ts
@attachment({ preComputeUrl: true })
declare avatar: AttachmentRelation

const link = await user.avatar.get()
const url = link?.attachment.url
```

The configured storage must provide a public URL, such as Adonis Drive or
`LocalFileStorage` with `baseUrl`. Signed URLs are always generated explicitly through
`attachmentService.getSignedUrl()` because they expire.

## Many attachments - `@attachments`

An **ordered** collection. Each item is a link row with a `position` and a `null`
`owner_key`.

```ts
import { attachments, type AttachmentCollectionRelation } from '@jrmc/adonis-attachment/lucid'

export default class Post extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @attachments({
    folder: ({ model }) => `posts/${model?.id}/gallery`,
  })
  declare gallery: AttachmentCollectionRelation
}
```

Collection mutations are staged the same way, then applied on `save()` (or
`await gallery.persist()`).

| Method | Does |
| --- | --- |
| `all()` | Reads items, ordered by position. Async. |
| `add(draft, position?)` | Stages an append (or insert at `position`). |
| `addMany(drafts, position?)` | Stages several attachments, in input order. |
| `addExisting(id, position?)` | Stages adding an existing blob (reuse). |
| `remove(id)` | Stages removal of one item; positions renormalize on flush. |
| `move(id, position)` | Stages a reorder. |
| `clear()` | Stages removal of all items. |
| `replaceAll(drafts)` | Stages a full swap of the collection. |
| `persist()` | Flushes staged operations now (requires a persisted owner). Async. |
| `regenerateVariants(keys?)` | Enqueues replacement generation for every persisted item. |

```ts
const drafts = await attachmentManager.createFromFiles(request.files('images'))

post.gallery.addMany(drafts)
await post.save()      // flush the collection

// Insert several files at a specific position.
post.gallery.addMany(drafts, 0)
await post.save()

// move takes the persisted link id from all()
const [first] = await post.gallery.all()
post.gallery.move(first.id, 0)
await post.save()
```

The `id` used by `move` and `remove` is the persisted **link id** returned by `all()`,
while `attachmentId` identifies the reusable blob.

## Reusing a blob across records

Because links point to blobs, you can attach the **same file** to several records without
copying it - pass an existing blob id:

```ts
const link = await user.avatar.get()

otherUser.avatar.attachExisting(link!.attachmentId)
await otherUser.save()

post.gallery.addExisting(link!.attachmentId)
await post.save()
```

The blob's file is deleted only when its **last** link is removed. There is no automatic
content-based deduplication - reuse is always explicit.

## Transactions

When your model runs inside a Lucid transaction, the staged mutations flushed on `save()`
**join it** automatically:

```ts
await db.transaction(async (trx) => {
  user.useTransaction(trx)
  user.avatar.set(draft)
  await user.save() // staged mutation flushes on the transaction's client
  // if the transaction rolls back, the newly written file is removed too
})
```

- Database rows are written on the transaction's client.
- **New files** written by `attach`/`set`/`add` are removed on **rollback**.
- **File deletions** from `detach`/`replace`/`remove`/`clear` are deferred until
  **commit** - a rollback keeps the previous files intact.

When a replacement would reuse the previous file's storage path (for example with
`rename: false`), its bytes are written to a unique subdirectory. The filename stays the
same; use the returned attachment's `path` or URL. Stage the draft on the relation before
persisting it so the integration can protect the previous file before any write.

Lucid retains draft bytes until persistence succeeds (or until the transaction commits).
After an insertion failure or rollback, cleanup restores the draft to an unpersisted state,
so it can be retried. After rollback, reload the owner and stage the draft again on its relation.

Deleting the owning record triggers an `after('delete')` hook that removes all of its
links (and any blobs that become unreferenced).

## Regenerate variants

Regeneration generates the requested variants again from each original, then replaces the
existing variant with the same key.

For one relation or one collection, call the accessor directly:

```ts
await user.avatar.regenerateVariants(['thumbnail'])
await post.gallery.regenerateVariants()
```

For maintenance work across a model, use `AttachmentRegenerator`. It fetches the model in
pages and enqueues work with bounded concurrency; it does not perform conversions in the
web request.

```ts
import { AttachmentRegenerator } from '@jrmc/adonis-attachment/lucid'
import User from '#models/user'

const result = await new AttachmentRegenerator()
  .model(User, {
    attributes: ['avatar'],
    variants: ['thumbnail'],
    batchSize: 100,
    concurrency: 5,
  })
  .run()

// { rows: 250, attachments: 250 }
```

Use `.row(user, options).run()` when a single persisted model must be regenerated. The
`attributes` option is validated against the model's declared attachment relations.

## Reading with variants

Load an owner field together with its variants through the store:

```ts
import { LucidAttachmentStore } from '@jrmc/adonis-attachment/lucid'

const found = await new LucidAttachmentStore().findByOwner({
  type: 'users',
  id: user.id,
  field: 'avatar',
})

if (found) {
  found.original.toAttachment()
  found.variants.map((v) => v.toAttachment())
}
```

**Next:** [Serving files](/guide/serving-files) · [Image variants](/guide/variants).
