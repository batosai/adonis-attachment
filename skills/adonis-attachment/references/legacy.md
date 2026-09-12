# Legacy JSON fields and collections

Use only with a v6 build exporting `@jrmc/adonis-attachment/legacy`. This experimental
facade keeps singular attachments or arrays in owner JSON columns. It is not a JSON option
on `/lucid` relations, a standalone store without Lucid, or complete v5 emulation.

## Model, configuration and validated upload

Keep the existing nullable `users.avatar` JSON column and files. No attachment, link or
lock table is needed for this field. Do not add `@column()` to `avatar` or map another
ordinary property to the same SQL column. Naming follows Lucid's strategy; `columnName`
is only needed when the physical column differs from that convention.

This self-contained example combines the model, config and controller for clarity. In
the application, keep them in their usual files and use the lazy model loader
`users: () => import('#models/user')` in `config/attachment.ts`.

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { HttpContext } from '@adonisjs/core/http'
import { defineConfig, LocalFileStorage } from '@jrmc/adonis-attachment'
import { attachment, attachmentManager, type Attachment } from '@jrmc/adonis-attachment/legacy'

export class User extends BaseModel {
  @column({ isPrimary: true }) declare id: number

  @attachment<User>({
    folder: (user) => `users/${user.id}/avatar`,
    variants: ['thumbnail'],
    meta: true,
    preComputeUrl: true,
  })
  declare avatar: Attachment | null
}

export const config = defineConfig({
  storage: LocalFileStorage.fromApp,
  route: false,
  integrations: { legacy: { models: { users: async () => ({ default: User }) } } },
  converters: { thumbnail: { resize: { width: 320 }, format: { format: 'webp' } } },
})

// Authorize the caller to update this user before invoking this controller.
export async function updateAvatar(user: User, { request, response }: HttpContext) {
  const file = request.file('avatar', { size: '5mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] })
  if (!file) return response.badRequest({ message: 'Avatar is required' })
  if (!file.isValid) return response.badRequest({ errors: file.errors })
  user.avatar = await attachmentManager.createFromFile(file)
  await user.save()
  return user.serialize()
}

export async function deleteAvatar(user: User) {
  user.avatar = null
  await user.save()
}
```

Preserve the app's storage instead of replacing it with this example's local backend.
Install `sharp` for this thumbnail and the dependencies needed by enabled metadata extractors.
Legacy decorator `folder` callbacks receive the model, and `rename` callbacks receive
`(model, field, originalName)`, not the `/lucid` context object.

The manager must come from `/legacy`, not the root. It also accepts
`createFromBuffer(bytes, 'avatar.jpg')` or a modern options object. Path/base64/URL/stream
sources use modern options; not every v5 overload exists. On singular fields only a new legacy draft or
`null` can be assigned, using direct assignment rather than `fill`/`merge`. Do not reuse
a persisted attachment on another owner or assign the same draft to multiple fields.

## Simple collections, without reordering

Keep the JSON array column. Use `attachments`, `Attachment` and `attachmentManager` from
`/legacy`, not `/lucid` or the root. Validate every file and authorize the operation first.

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { HttpContext } from '@adonisjs/core/http'
import { attachments, attachmentManager, type Attachment } from '@jrmc/adonis-attachment/legacy'

export class User extends BaseModel {
  @column({ isPrimary: true }) declare id: number
  @attachments({ variants: ['thumbnail'], meta: true }) declare gallery: Attachment[] | null
}

export async function appendImages(user: User, { request, response }: HttpContext) {
  const files = request.files('images', { size: '5mb', extnames: ['png', 'jpg', 'webp'] })
  if (!files.length || files.some((file) => !file.isValid)) {
    return response.badRequest({ message: 'Valid images are required' })
  }
  user.gallery = [...(user.gallery ?? []), ...await attachmentManager.createFromFiles(files)]
  await user.save()
  return user.serialize()
}

export async function removeImage(user: User, id: string) {
  user.gallery = (user.gallery ?? []).filter((item) => item.id !== id)
  await user.save()
}
```

Use the same registered model and converter configuration as for singular fields. Native
`push`, removal by `splice`/`filter`, and reassignment are detected on save. Retain loaded
items and append new drafts; duplicates, foreign items, sparse arrays, reordering, or new
items before retained items are rejected. No `move`, `addMany`, or relation wrapper exists.
SQL NULL/JSON null read as null, JSON `[]` as an array; iterate with `gallery ?? []`.

Array edits remove only loaded items and preserve concurrent additions. `gallery = []`
removes loaded items; `gallery = null` explicitly clears the current field. Stale retained
items removed elsewhere are not resurrected. Mutate each original/variant `meta` and save
the owner. Serialization is an array; custom `serialize` applies per attachment, like v5.
Refresh after jobs. Use shared `AttachmentRegenerator.row/model` with `attributes: ['gallery']`
for all items, not `gallery.regenerateVariants()`. The array is mutable, unlike `.variants`.

## What the registry and queue do

`integrations.legacy.models` maps trusted owner types to lazy model modules. The key
matches the decorator's `type`, which defaults to the model table (`users` here). It
enables legacy processing and lets jobs reload the current JSON, even in a fresh worker
process. It does not scan all users, create tables, or choose the decorator's storage.
Keep Lucid integration enabled. The old `integrations.lucid.jsonModels` is removed;
do not import internal JSON stores/registries or expect them to be exported by `/lucid`.

Both the default memory queue and external Adonis Queue workers support legacy variants
and deferred metadata. External jobs forward the full `AttachmentJob` payload to
`createLucidAttachmentProcessor(app)` from `/lucid`, just as for table fields. Workers
must load the same config, model registry, storage and media dependencies. Memory jobs
are non-durable and have no automatic retry; use `onFailure` to observe failures.

## Read, mutate and serialize

`user.avatar?.getUrl()` and `getUrl('thumbnail')` use storage URLs. Signed URLs use
`getSignedUrl(options)` or `getSignedUrl('thumbnail', options)`; authorize access first.
The built-in blob-ID route does not resolve legacy references. For JSON-only/private
apps use `route: false` and an authorized owner-based route, or authorized signed URLs.
Local direct URLs need a storage `baseUrl`; methods may return undefined when unsupported.

`getVariant('thumbnail')` synchronously returns a loaded variant or null, without SQL.
After background jobs finish, refresh the model or fetch a new instance. Save pending
edits first; refresh refuses to discard them. A partial select omitting `avatar` cannot
read or serialize it: load the column or explicitly omit that field from serialization.

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { attachment, type Attachment } from '@jrmc/adonis-attachment/legacy'
import { AttachmentRegenerator } from '@jrmc/adonis-attachment/lucid'

export class User extends BaseModel {
  @column({ isPrimary: true }) declare id: number
  @attachment() declare avatar: Attachment | null
}

export async function changeCaptions(user: User) {
  if (user.avatar) {
    user.avatar.meta ??= {}
    user.avatar.meta.caption = 'Profile photo'
  }
  const thumbnail = user.avatar?.getVariant('thumbnail')
  if (thumbnail) {
    thumbnail.meta ??= {}
    thumbnail.meta.caption = 'Small preview'
  }
  await user.save()
}

export async function regenerateAvatar(user: User) {
  await new AttachmentRegenerator()
    .row(user, { attributes: ['avatar'], variants: ['thumbnail'] })
    .run()
}
```

Regeneration requires the registered model and converter and only enqueues work. There
is no legacy `user.avatar.regenerateVariants()` method. File properties and the variants
array are read-only; do not insert/delete variants manually. Original and variant `meta`
are editable. `serialize()` includes the avatar, `meta` and variants under their keys,
with URLs when `preComputeUrl` is enabled. `serializeAs`, custom serialization and Lucid
cherry-picking are supported. Old `keyId`/`getKeyId()` and `router.attachments()` are not;
do not promise byte-for-byte v5 response compatibility.

## Concurrency and safe cutover

Saves lock and reread the existing owner row inside the Lucid transaction; they do not
use `JSON_SET` or a separate lock dependency/table. Metadata uses a three-way patch:
independent nested keys merge, conflicting edits or a replaced target raise
`AttachmentMetadataConflictError` (409), imported from `/legacy`, not the root. Arrays
and whole-value replacements are atomic. On conflict, fetch a fresh model and decide
which edits to reapply; do not blindly retry a stale object. Explicit avatar replacement
or null assignment is different: the last committed replacement wins.

Ordinary attributes, legacy fields and table relations can share the owner transaction.
Rollback restores pending drafts/meta and cleans new files; replaced files are deleted
after commit. Bulk query updates/deletes bypass hooks. JSON fields have no global file
reference counts; audit historical files shared between fields before replacement/deletion.

Stop v5 writers and jobs before cutover. Retain database AND file backups, and test on
copies: replacement/deletion removes real files. Existing JSON is read in place and IDs
may be backfilled on mutation; switching back to v5 after new writes is not guaranteed.
