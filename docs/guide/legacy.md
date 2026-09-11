# Legacy JSON fields (experimental)

Available on `feat/json-persistence`, not necessarily in published v6 alphas. This
facade keeps familiar v5 usage for **one attachment per field**, backed by the v6
transactional JSON engine. No attachment tables, lock table or lock dependency are needed.
The default v6 API remains the table-backed `/lucid` integration.

## Avatar on a user

Keep the existing nullable `users.avatar` JSON column and stored files:

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { attachment, type Attachment } from '@jrmc/adonis-attachment/legacy'

export default class User extends BaseModel {
  @column({ isPrimary: true }) declare id: number

  @attachment<User>({
    folder: (user) => `users/${user.id}`,
    preComputeUrl: true,
    variants: ['thumbnail'],
    meta: true,
  })
  declare avatar: Attachment | null
}
```

Do **not** add `@column()` to `avatar`. Column names follow Lucid's naming strategy;
use `columnName` only if your existing SQL column has a different name. Folder callbacks
receive the model; rename callbacks receive `(model, field, originalName)`.

```ts
import { attachmentManager } from '@jrmc/adonis-attachment/legacy'

user.avatar = await attachmentManager.createFromFile(file) // validated multipart file
await user.save()

console.log(user.avatar?.originalName)
console.log(await user.avatar?.getUrl())
console.log(await user.avatar?.getUrl('thumbnail'))
console.log(user.avatar?.getVariant('thumbnail'))

if (user.avatar) {
  user.avatar.meta ??= {}
  user.avatar.meta.caption = 'Profile photo'
  await user.save()
}

user.avatar = null
await user.save()
```

The manager also provides `createFromBuffer(bytes, 'avatar.jpg')`, `createFromPath`,
`createFromBase64`, `createFromUrl` and `createFromStream`. The latter methods accept
the v6 source-options object; not every historical v5 overload is reproduced.
Only new legacy drafts or `null` can be assigned. Copying an already persisted attachment
to another owner is rejected because JSON fields have no global file reference counts.
Use direct field assignment, not Lucid `fill`/`merge` for the attachment itself.

## Variants and metadata jobs

Use v6 converters and register the model for contextual job routing:

```ts
import { AdonisDriveStorage, defineConfig } from '@jrmc/adonis-attachment'

export default defineConfig({
  storage: AdonisDriveStorage.fromApp,
  route: false,
  integrations: { lucid: { jsonModels: { users: () => import('#models/user') } } },
  converters: {
    thumbnail: { converter: () => import('#converters/thumbnail_converter') },
  },
})
```

The registry key must match the decorator's logical `type` (the model table by default).
The default memory queue generates variants and extracts configured metadata. Pending
memory jobs are lost on process termination; this is not a durable queue. The existing
v6 external-worker routing can also resolve these registered JSON fields. This facade
does not add another queue implementation or require the v5 locking library.

Accessing `user.avatar` or `getVariant()` performs **no SQL query**. The value is a
snapshot of the loaded JSON, not a live view. After background jobs finish, use
`await user.refresh()` or fetch a new model. Save pending attachment/meta edits first;
refresh refuses to discard them. Lucid refresh does not copy `$extras`, so the facade
performs an additional JSON read during refresh. A partial select omitting the JSON
column cannot access or serialize that field; explicitly omit it from serialization
or load it first. Normal `find`, `fetch` and pagination hooks hydrate loaded fields.

Variant metadata is editable using the same rules:

```ts
const thumbnail = user.avatar?.getVariant('thumbnail')
if (thumbnail) {
  thumbnail.meta ??= {}
  thumbnail.meta.caption = 'Small preview'
  await user.save()
}
```

The variants array and file properties are read-only; this facade does not expose
manual variant insertion or deletion. The shared v6 regeneration service remains
available for registered JSON model fields.

## Concurrency and transactions

Writes lock the existing owner row and reread its JSON in a transaction. They do not
use `JSON_SET`. Ordinary Lucid saves never write an old avatar snapshot back wholesale.
For `meta`, the facade compares the loaded baseline with the edited object and applies
only those changes to current metadata under the lock:

- Independent object keys, including nested keys, merge. Newly generated variants survive.
- Conflicting edits to the same value fail with `E_ATTACHMENT_METADATA_CONFLICT` (409).
- Arrays and whole-value replacements are atomic, not merged item by item.
- Metadata targeting an avatar/variant replaced or removed meanwhile is rejected.

On conflict, the transaction rolls back; reload a fresh model and decide which changes
to reapply. An explicit avatar replacement or `null` assignment is a current-field
operation, not a metadata patch: the last successfully committed replacement wins.

New-owner insertion, ordinary attributes, legacy fields and table relations participate
in the same model-save transaction. Rollback restores pending drafts/meta changes and
cleans newly written files; replaced files are removed only after commit. Bulk query
updates/deletes bypass model hooks and are not supported attachment operations.

## Serialization and compatibility scope

`user.serialize()` automatically includes the avatar, `meta`, and variants under their
keys (for example `avatar.thumbnail`), with precomputed URLs when enabled. `serializeAs`,
`serializeAs: null`, custom `serialize(value, field, model)` and Lucid field cherry-picking
are supported. File reads use `getBytes()`/`getBuffer()`; signed URLs use
`getSignedUrl(options)` or `getSignedUrl('thumbnail', options)`.

This is not a complete v5 emulation: collections, old `keyId`, low-level mutable file
internals, and every historical manager overload are outside this first facade. Response
objects are not promised byte-for-byte v5-compatible. Review your transformers and tests.
Old JSON `meta`/`variants` documents are read in place; missing IDs are backfilled on
mutation. Stop v5 writers/jobs before cutover and retain database **and file** backups.
See the [migration guide](/migration/from-v5) for the cutover checklist.
