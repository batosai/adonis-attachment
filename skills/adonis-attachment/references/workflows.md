# Application workflows

These recipes use table-backed `/lucid` relations. For a singular JSON field, follow
[legacy JSON fields](legacy.md) instead; its imports, assignment and serialization differ.

## Install and configure

Check that the installed version is v6; these instructions do not upgrade a v5 app implicitly.
For a fresh installation select the intended v6 release, then run the configure hook.
`node ace add @jrmc/adonis-attachment` installs the registry default, which may be another
major while v6 is in alpha. With v6 already installed, run:

```sh
node ace configure @jrmc/adonis-attachment
```

It generates `config/attachment.ts` from a stub and registers the provider and commands.
Do not replace the application's entire `adonisrc.ts`. For table-backed Lucid fields,
install/configure that integration if missing, then generate and run attachment schema migrations:

```sh
node ace make:attachments-table
node ace migration:run
```

The generated migration delegates to `AttachmentSchemaService`. Set a custom
`integrations.lucid.tableName` before generation and use the same name at runtime.
Defaults are `adonis_attachments` / `adonis_attachment_links`; `media_attachments` derives
`media_attachment_links`. Existing tables require an explicit migration or matching config.

## Model and upload

Adapt this example to the application's existing model rather than replacing its fields:

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { HttpContext } from '@adonisjs/core/http'
import { attachmentManager } from '@jrmc/adonis-attachment'
import {
  attachment, attachments,
  type AttachmentRelation, type AttachmentCollectionRelation,
} from '@jrmc/adonis-attachment/lucid'

export class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @attachment<User>({ folder: ({ model }) => `users/${model?.id}/avatar` })
  declare avatar: AttachmentRelation

  @attachments({ folder: 'gallery' })
  declare gallery: AttachmentCollectionRelation
}

// Call only after authorizing the caller to update this user.
export async function updateAvatar(user: User, { request, response }: HttpContext) {
  const file = request.file('avatar', { size: '5mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] })
  if (!file) return response.badRequest({ message: 'Avatar is required' })
  if (!file.isValid) return response.badRequest({ errors: file.errors })
  const draft = await attachmentManager.createFromFile(file)
  user.avatar.set(draft)
  await user.save()
  const link = await user.avatar.get()
  return { attachmentId: link?.attachmentId ?? null }
}

export async function updateGallery(user: User, context: HttpContext) {
  const files = context.request.files('images', { size: '5mb', extnames: ['png', 'jpg'] })
  if (!files.length || files.some((file) => !file.isValid)) {
    return context.response.badRequest({ message: 'Valid images are required' })
  }
  user.gallery.addMany(await attachmentManager.createFromFiles(files))
  await user.save()
  const links = await user.gallery.all()
  if (links[0]) {
    user.gallery.move(links[0].id, 0)
    await user.save()
  }
  return links.map((link) => ({ id: link.id, attachmentId: link.attachmentId }))
}
```

Wire the controller into `start/routes.ts` using the application's authentication and
authorization conventions. Keep CSRF protection for browser forms; use multipart encoding.

`attach(draft)` requires an empty singular relation; `set/replace(draft)` replaces or creates.
To delete, stage `user.avatar.detach()` or `user.gallery.clear()`, then save. Collection
`remove(id)` and `move(id, position)` take link IDs. Reuse an existing blob with
`attachExisting(blobId)` or `addExisting(blobId)`. Files and variants are purged only when
their blob is no longer linked. Owner deletion uses model hooks; raw/bulk database deletes
must not be assumed to execute those hooks.

Relations join the owner's Lucid transaction. New files are cleaned on rollback; old files
are deleted after commit. Stage drafts before persisting so replacement can protect old
paths. After rollback, reload the owner and stage the restored draft again before retrying.

## Sources and options

All source methods accept an options object, not a positional filename:
`createFromFile(file, options?)`, `createFromFiles(files, options?)`,
`createFromBuffer(bytes, options?)`, `createFromBase64(value, options?)`,
`createFromPath(path, options?)`, `createFromUrl(url, options?)`, and
`createFromStream(readable, options?)`.

Use `originalName` / `mimeType` for sources without that information. Persistence options
are `disk`, `folder`, `rename`, `normalizeFileName`, `meta`, `preComputeUrl`, and `variants`.
`metadata` supplies known values; `meta` requests extraction. `maxBytes` is an opt-in
source ceiling, not application upload validation. Restrict application-supplied remote
URLs and filesystem paths to the resources the caller is allowed to access.

`rename` defaults to true (generated filename). False retains a normalized client filename;
`normalizeFileName` defaults to true and makes it portable. Disabling normalization may
cause Drive to reject spaces, apostrophes, or accents. `originalName` stays unchanged.
`folder` is a relative string or async callback; `rename` can also be an async callback.
Callbacks receive `{ model, field, originalName }`. The manager does not infer a model type;
close over an existing model or put the callback on the relation decorator.
`:attribute` substitution works only for string model attributes, lowercased and slugified.
Use a decorator callback for a numeric auto-increment ID available after the owner is saved.

## Read and serve

```ts
import { attachmentService, type Attachment } from '@jrmc/adonis-attachment'

export function publicRouteUrl(attachment: Attachment) {
  return `/attachments/${attachment.id}/${encodeURIComponent(attachment.name)}`
}

export async function storageUrls(attachment: Attachment) {
  return {
    publicUrl: await attachmentService.getUrl(attachment),
    signedUrl: await attachmentService.getSignedUrl(attachment, { expiresIn: '10 mins' }),
  }
}
```

The optional route filename is cosmetic, not an authorization check. Lucid detection or
an explicit repository enables the read route. `route: { prefix: '/files' }` changes its
prefix. URL methods may return undefined if storage does not support them; signed options
are forwarded to that storage backend. Authorize the caller before issuing a signed URL.
`preComputeUrl: true` sets public `.url` in memory on relation reads, never in the database.
It does not precompute signed URLs. Local storage needs `baseUrl` for direct public URLs;
otherwise use the built-in public route or an authorized application route.

For Edge, pass the computed URL to the view. For JSON/Inertia, return an explicit object.
Do not use v5's `user.avatar.getUrl()`, `getVariant()`, `getKeyId()`, `router.attachments()`,
`serializeAs`, or direct property assignment on table relations. The separate `/legacy`
facade supports direct assignment, URL/variant getters and serialization, but not `getKeyId()`
or `router.attachments()`.
