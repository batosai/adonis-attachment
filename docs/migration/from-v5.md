# Migrate from v5

v6 is a **breaking release**. The default table-backed API uses relation methods.
For JSON fields such as an avatar or gallery, the experimental `/legacy` entry point
keeps direct assignment, `meta` mutations and automatic serialization. Configuration
and imports still change; this is not a drop-in replacement for all v5 APIs.

::: warning Experimental JSON option
The JSON path below describes the implementation on `feat/json-persistence`. Do not
assume it exists in an older published v6 alpha. Use a build containing this integration.
:::

## Choose a migration path per field

| | Keep JSON (experimental) | Migrate to tables (default) |
| --- | --- | --- |
| Import | `@jrmc/adonis-attachment/legacy` | `@jrmc/adonis-attachment/lucid` |
| Declaration | `@attachment()` with `Attachment \| null`; `@attachments()` with `Attachment[] \| null` | `@attachment()` with `AttachmentRelation`; `@attachments()` with `AttachmentCollectionRelation` |
| Storage | Existing JSON column on the owner | Blob table and polymorphic link table |
| Existing data | Read in place; IDs added on subsequent mutations | Convert JSON values into blob/link rows |
| Files | Keep existing disks and file paths | Keep existing disks and file paths |
| Sharing a file between owners | Not supported | Supported through links |

The legacy facade covers **singular fields and simple collections**, including variants,
metadata and blurhash. Legacy collections use ordinary arrays without reordering; table
relations offer explicit collection positioning and shared blobs. JSON storage
is reserved for `/legacy`; the earlier experimental JSON relation API has been removed.
Choose each field's path **before** running the data-migration script, which is only for
fields moving to tables.

The package upgrade is part of the workflow you choose below. Upgrade the application to
AdonisJS 7 and Node.js 24+ first if necessary.

## Path A: keep the existing JSON columns

You do **not** need to create attachment/link tables, add a lock table, or run
`make:attachment-v5-migration` for these fields. Keep the owner columns and stored files.
The API and application configuration still need to change.

::: tip Choose one workflow
Use **Option 1** with an AI coding agent **or** follow **Option 2** manually. They are
alternatives: do not follow the manual checklist after giving the prompt to an agent.
In both cases, a human must still approve and perform the production cutover.
:::

### Option 1: Use an AI coding agent for the `/legacy` path

This is a prompt for an AI coding agent that has the
`adonis-attachment-migration` skill available. The skill contains the complete procedure;
the prompt only selects the path and scope.

```text
Use the `adonis-attachment-migration` skill to upgrade this project from
@jrmc/adonis-attachment v5 to v6. Keep the selected fields in their existing JSON columns
with the `/legacy` integration; do not migrate them to tables.

Inspect and migrate every unambiguous v5 attachment field unless I provide a narrower list.
Follow the skill completely, including configuration, dependencies, tests and its safety rules.
Do not continue with the manual option below.
```

### Option 2: Migrate manually

Follow the rest of this path only when you chose the manual workflow above.

#### Install and configure v6

Confirm the application already uses AdonisJS 7 and Node.js 24+, then upgrade the package
and run its configure hook:

```sh
npm install @jrmc/adonis-attachment@next
node ace configure @jrmc/adonis-attachment
```

Confirm that the installed build exports `@jrmc/adonis-attachment/legacy` before continuing.
Upgrade AdonisJS separately if required; it is not part of this migration guide.

::: danger Do not bypass a dependency conflict
Never add `--legacy-peer-deps`, `--force` or another peer-dependency bypass to these commands.
If installation reports a conflict, stop and resolve the incompatible package versions first.
After installation, review `package.json` and the lockfile diff; no unrelated dependency should
have been removed or changed.
:::

#### Migrate configuration and optional dependencies

Start with the generated `config/attachment.ts`, then compare it with the v5 configuration.
Keep the existing storage adapter, disk names and file paths: do not silently switch a Drive
application to `LocalFileStorage`. Compare the **effective** v5 defaults, including omitted
options, with the v6 defaults before copying them. When an implicit v6 value differs from the
behaviour the application relied on in v5, configure that v6 value explicitly. Transfer each
configured option deliberately:

| Existing concern | v6 configuration |
| --- | --- |
| Default disk, folder and naming | `storage`, `defaultDisk`, then `defaults.disk`, `folder`, `rename` and `normalizeFileName` |
| Variant keys and their options | `converters`; keep the matching `variants` option on each legacy decorator or in `defaults` |
| `meta` and custom metadata extraction | `defaults.meta` or decorator `meta`; retain custom extractors in `media.metadata` and deferred work in `media.metadataPolicy` only when used |
| ffmpeg, ffprobe, Poppler or LibreOffice paths | `media.binaries`, preserving commands and timeouts |
| Background work | `queue` and the external worker; also register every JSON owner in `integrations.legacy.models` |
| Serving URLs | `route: false` only for JSON-only applications; otherwise use a custom owner-authorized route for JSON fields and preserve any table route in mixed applications |

Install only the packages required by the resulting configuration:

```sh
npm install sharp                 # image variants or technical image metadata
npm install exifreader            # EXIF or GPS metadata
npm install blurhash              # blurhash: true (also requires sharp)
node ace add @adonisjs/drive      # Adonis Drive storage
node ace add @adonisjs/queue      # durable external attachment jobs
```

Do not run every command blindly. Video, PDF and Office support also needs `ffmpeg`, Poppler
or LibreOffice installed in the deployment runtime; configure their paths under `media.binaries`.
For an external worker, load the same configuration and use
`createLucidAttachmentProcessor(app)` so registered legacy fields resolve correctly.

#### Declare the JSON field

For an existing `users.avatar` column:

```ts
// app/models/user.ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { attachment, type Attachment } from '@jrmc/adonis-attachment/legacy'

export default class User extends BaseModel {
  static table = 'users'

  @column({ isPrimary: true })
  declare id: number

  @attachment({ preComputeUrl: true, variants: ['thumbnail'], meta: true })
  declare avatar: Attachment | null
}
```

The column name is inferred using Lucid's naming strategy: the `avatar` field uses
the existing `avatar` column, without any extra option.

Do not add `@column()` to `avatar`, or map another ordinary attribute to the same
database column. The relation manages its writes transactionally; it is not part of
Lucid's ordinary dirty attributes. A stale model saving another attribute therefore
does not write its old JSON snapshot over a worker's changes.

::: tip Generated schemas need no exclusion rule
`@attachment()` and `@attachments()` automatically take over a matching `@column()` inherited
from a base class, mixin or generated schema class. The generated class, SQL column and
TypeScript field remain unchanged; only the concrete legacy model stops treating that column as
an ordinary Lucid attribute. Do not add `skipColumns` rules for legacy fields.

Regenerate the schema and boot or import each migrated model in a focused test before deploying.
:::

Configure the `thumbnail` converter in v6, or omit `variants` if you do not use it.

<details>
<summary>Optional: a different property name from the existing column</summary>

Use `columnName` only to override the inferred name. For example, if you want to call
the TypeScript field `profilePicture` while keeping the SQL column `avatar`, use this
declaration **instead of** the `avatar` declaration above:

```ts
@attachment({ columnName: 'avatar', preComputeUrl: true })
declare profilePicture: Attachment | null
```

Your application then uses `user.profilePicture = ...`. No database column rename is required.

</details>

#### Keep direct assignment for a singular avatar

With an already validated multipart `file`, creation and replacement become:

```ts
import User from '#models/user'
import { attachmentManager } from '@jrmc/adonis-attachment/legacy'

const user = await User.findOrFail(42)
user.avatar = await attachmentManager.createFromFile(file)
await user.save()

console.log(user.avatar?.originalName)
console.log(await user.avatar?.getUrl('thumbnail'))
if (user.avatar) {
  user.avatar.meta ??= {}
  user.avatar.meta.caption = 'Profile photo'
  await user.save()
}
console.log(user.serialize()) // includes avatar, meta and named variants

user.avatar = null
await user.save()
```

Import the manager from `/legacy` too: the root manager returns modern drafts, not
legacy values. File writes and removals are staged until `save()`; deletions happen
after commit. `user.avatar` reads the loaded snapshot synchronously. Use `await user.refresh()`
after background jobs to reload variants and metadata. Save pending changes before refreshing.
`serializeAs` and custom `serialize` are supported; old `keyId` output is not reproduced.
See [Legacy JSON fields](/guide/legacy) for scope and concurrency rules.

#### Keep a collection as a JSON array

Import `attachments`, `Attachment` and `attachmentManager` from `/legacy`. Keep the old
nullable `gallery` column, without an additional `@column()` decorator:

```ts
@attachments({ variants: ['thumbnail'], meta: true })
declare gallery: Attachment[] | null
```

After validating the files, append with
`user.gallery = [...(user.gallery ?? []), ...await attachmentManager.createFromFiles(files)]`,
then `await user.save()`. Remove items with `filter` or `splice`, then save. Existing
items must come from that loaded field; new drafts append after retained items. There
is no reorder API, and reordering attempts are rejected. Do not substitute table relation
methods such as `addMany()` or `move()` on this ordinary array.

Array edits preserve concurrent additions; `[]` removes the loaded items while `null`
explicitly clears the current field, including unseen additions. Original and variant
`meta` edits are saved with the owner. Custom `serialize` still applies per item.
See [legacy collections](/guide/legacy#a-simple-collection) for the complete workflow.

#### Configure storage and worker routing

```ts
// config/attachment.ts
import { AdonisDriveStorage, defineConfig } from '@jrmc/adonis-attachment'

export default defineConfig({
  storage: AdonisDriveStorage.fromApp,
  route: false,
  integrations: {
    legacy: {
      models: { users: () => import('#models/user') },
    },
  },
  // Add your v6 converter, metadata and queue configuration as needed.
})
```

The registry key (`users`) must match the relation's logical `type`, which defaults to
the model table. These trusted imports let both memory and external workers resolve
the model and JSON field, including in a fresh worker process. Keep Lucid integration
enabled for this automatic routing. Custom repositories/processors/persisters must also
handle JSON references if you override the defaults.

The built-in ID-only HTTP route remains table-backed. For JSON, use Drive URLs or an
application route with your own authorization; `route: false` disables the table route
for JSON-only applications. See [JSON persistence](/guide/json-persistence) for details.

#### Verify data compatibility and cut over

1. **Back up the database and files**, then rehearse on a staging copy.
2. **Verify the existing documents and column capacity.** The reader accepts singular
   v5 objects and collection arrays, with `meta` and `variants`, as native or serialized
   JSON. `NULL` means empty. Invalid documents, duplicate IDs/variant keys and duplicate
   file locations within a field are rejected. Oracle needs CLOB capacity, not a
   `VARCHAR2(4000)` column that cannot hold larger documents.
3. **Verify disks and file paths.** Keep the old Drive disks available. Legacy documents
   missing a disk use the resolved field/config disk; those missing a path use their
   stored `name`. Confirm these fallbacks point to the actual old files.
4. **Update and test application calls**, including upload, replacement, deletion,
   collections, URLs and worker jobs. Do not copy a file location between JSON owners
   or fields: this mode has no global reference counting for shared files.
5. **Pause v5 attachment writes and finish or retire pending v5 jobs before cutover.**
   Do not run v5 writers alongside the v6 writers on these columns. After deploying
   the updated models, configuration and workers, resume writes through v6.

Reading legacy documents does not rewrite the database. Missing IDs are derived
deterministically for reads; the next mutation persists IDs alongside the v5 fields,
including variant IDs. Unknown document fields are retained when updating existing
documents. This is data-reading compatibility, not byte-for-byte v5 output or a promise
of safe downgrade after v6 writes. Retain backups for recovery: replacements and deletions
can remove old files after commit, so restoring old JSON alone may not restore those files.

## Path B: migrate JSON data to tables

With the default table-backed mode, existing v5 values **must** be converted into blob
and link rows. The package supplies migration tools, but your application supplies the
owner/column mapping. Follow this path only for fields you chose to move to tables.

::: tip Choose one workflow
Use **Option 1** with an AI coding agent **or** follow **Option 2** manually. They are
alternatives: do not follow the manual checklist after giving the prompt to an agent.
In both cases, a human must still approve and perform the production cutover.
:::

### Option 1: Use an AI coding agent for the table path

This is a prompt for an AI coding agent that has the
`adonis-attachment-migration` skill available. The skill contains the complete procedure;
the prompt only selects the path and scope.

```text
Use the `adonis-attachment-migration` skill to upgrade this project from
@jrmc/adonis-attachment v5 to v6. Migrate the selected JSON attachment fields to the
table-backed `/lucid` integration, preserving existing files and JSON columns until cutover.

Inspect and migrate every unambiguous v5 attachment field unless I provide a narrower list.
Follow the skill completely, including configuration, dependencies, mapping script, tests and
its safety rules. Do not continue with the manual option below.
```

### Option 2: Migrate manually

Follow the rest of this path only when you chose the manual workflow above.

#### Install and configure v6

Confirm the application already uses AdonisJS 7 and Node.js 24+, then upgrade the package
and run its configure hook:

```sh
npm install @jrmc/adonis-attachment@next
node ace configure @jrmc/adonis-attachment
```

Upgrade AdonisJS separately if required; it is not part of this migration guide.

::: danger Do not bypass a dependency conflict
Never add `--legacy-peer-deps`, `--force` or another peer-dependency bypass to these commands.
If installation reports a conflict, stop and resolve the incompatible package versions first.
After installation, review `package.json` and the lockfile diff; no unrelated dependency should
have been removed or changed.
:::

#### Migrate configuration and optional dependencies

Start with the generated `config/attachment.ts`, then compare it with the v5 configuration.
Keep the existing storage adapter, disk names and file paths: do not silently switch a Drive
application to `LocalFileStorage`. Compare the **effective** v5 defaults, including omitted
options, with the v6 defaults before copying them. When an implicit v6 value differs from the
behaviour the application relied on in v5, configure that v6 value explicitly. Transfer each
configured option deliberately:

| Existing concern | v6 configuration |
| --- | --- |
| Default disk, folder and naming | `storage`, `defaultDisk`, then `defaults.disk`, `folder`, `rename` and `normalizeFileName` |
| Variant keys and their options | `converters`; keep the matching `variants` option on each relation or in `defaults` |
| `meta` and custom metadata extraction | `defaults.meta` or relation `meta`; retain custom extractors in `media.metadata` and deferred work in `media.metadataPolicy` only when used |
| ffmpeg, ffprobe, Poppler or LibreOffice paths | `media.binaries`, preserving commands and timeouts |
| Background work | `queue` and the external worker using `createLucidAttachmentProcessor(app)` |
| Attachment tables and serving | `integrations.lucid.tableName` before generating the schema; keep the built-in route, configure its prefix, or set `route: false` for an authorized application route |

Install only the packages required by the resulting configuration:

```sh
npm install sharp                 # image variants or technical image metadata
npm install exifreader            # EXIF or GPS metadata
npm install blurhash              # blurhash: true (also requires sharp)
node ace add @adonisjs/drive      # Adonis Drive storage
node ace add @adonisjs/queue      # durable external attachment jobs
```

Do not run every command blindly. Video, PDF and Office support also needs `ffmpeg`, Poppler
or LibreOffice installed in the deployment runtime; configure their paths under `media.binaries`.

#### Migration checklist

1. **Create the new schema.**

   ```sh
   node ace make:attachments-table
   node ace migration:run
   ```

   The stub delegates the blob and link definitions to `AttachmentSchemaService`.

2. **Generate a data-migration script.**

   ```sh
   node ace make:attachment-v5-migration
   ```

   This renders a script into `database/scripts`. Use `--disk=s3` or
   `--folder=...` to change defaults.

3. **Fill in the mapping.** In the generated script, implement `legacyAttachmentRecords`
   so it yields each legacy JSON value together with its `{ type, id, field }` owner.

4. **Test on a staging copy** of the database, check the output, then run in production.
   This is a real write operation: there is no built-in dry-run flag.

5. **Ship the reading code** (models using the new persistence) **before** dropping the old
   JSON columns for migrated fields. Never drop columns retained by Path A fields.

The script uses `migrateLegacyAttachmentRecords`, which writes blob and link rows in
batches (a threshold of 100 blob rows by default, including variants; a complete source
record can take a batch above that threshold). It preserves file paths, disk names, metadata,
variant blurhashes, and the relationship between an original and its variants. It does not
move files in storage; only database rows change.

For a v5 collection, yield its JSON array as a single record. Serialized JSON arrays are
also accepted. Each original receives a collection link with a null `owner_key` and its
zero-based position; each original's variants remain attached to that original.

```ts
yield {
  owner: { type: 'users', id: String(user.id), field: 'gallery' },
  kind: 'many',
  value: user.gallery,
}
```

To yield collection items individually, supply `kind: 'many'` and `position` on every
record. Object values default to singular relations; arrays default to collections.
Empty arrays are skipped. The migration counters count originals and variants separately.

The v5 `meta` object is copied unchanged to the v6 `metadata` column for both originals and
variants. Newly uploaded files use the default Sharp, EXIF, video, and PDF metadata profile
whenever `meta: true` is enabled; no extractor configuration is required.

#### Map and run the generated script

Read legacy columns with the database query builder, not the new relation accessors.
For example, replace `legacyAttachmentRecords` in the generated script with this iterator
and add the `db` import. This example assumes a numeric `users.id` and legacy JSON columns
named `avatar` and `gallery`; adapt those names and pagination to your schema.
If a field remains JSON-backed, omit it from this iterator.

```ts
import db from '@adonisjs/lucid/services/db'

async function* legacyAttachmentRecords(): AsyncGenerator<LegacyAttachmentMigrationRecord> {
  let afterId: number | undefined
  while (true) {
    const query = db.from('users').select('id', 'avatar', 'gallery').orderBy('id').limit(100)
    if (afterId !== undefined) query.where('id', '>', afterId)
    const users = await query
    if (users.length === 0) break

    for (const user of users) {
      yield {
        owner: { type: 'users', id: String(user.id), field: 'avatar' },
        kind: 'one',
        value: user.avatar,
      }
      yield {
        owner: { type: 'users', id: String(user.id), field: 'gallery' },
        kind: 'many',
        value: user.gallery,
      }
    }
    afterId = users[users.length - 1].id
  }
}
```

The owner's `type` must match the new model's table, or the decorator's explicit `type`.
The `field` is the TypeScript property name. Verify that every migrated `disk` is available
in the new storage adapter and that its paths still resolve to the same files.

Run the script from an Ace command so Adonis boots its providers and database connection:

```sh
node ace make:command migrate_attachments
```

Replace the generated command implementation with:

```ts
// commands/migrate_attachments.ts
import { BaseCommand } from '@adonisjs/core/ace'

export default class MigrateAttachments extends BaseCommand {
  static commandName = 'attachments:migrate-v5'
  static options = { startApp: true }

  async run() {
    // Replace the timestamp with the generated script's actual filename.
    const { default: migrateAttachments } = await import(
      '../database/scripts/1700000000000_migrate_v5_attachments.js'
    )
    await migrateAttachments()
  }
}
```

```sh
node ace attachments:migrate-v5
```

New scripts export an async function and do not execute on import. For an older generated
script, change `async function main()` to `export default async function migrateAttachments()`
and remove `void main()` before using this command. Do not run the data script directly
with Node: it requires a booted Adonis application.

#### Verification and recovery

- Back up the database, retain the old JSON columns, and pause attachment writes during
  the final migration and cutover. The helper does not synchronize concurrent uploads.
- Check singular links, collection ordering, variant keys, metadata, and sample file URLs
  before switching the application to the new decorators.
- Each batch commits independently. A later failure does not undo earlier batches.
- The script is **not idempotent**: replaying rows can duplicate collection links or hit
  singular-link constraints. On staging, restore the pre-migration database snapshot
  before repeating a full run. For production resumption, implement a durable checkpoint
  or migration ledger committed with each batch; an in-memory iterator cursor is not one.
- Do not delete migrated files during database recovery: they are still the original v5 files.

#### Update model decorators

For the table path, complete the migration procedure above and verify both the new rows
and file access before switching your models. For the JSON path, use the declarations
and cutover checklist in Path A instead.

`@attachment()` without a persistence option declares a table-backed singular relation.
The import moves to the Lucid entry point; change the property type and use relation methods:

```ts
import { attachment, type AttachmentRelation } from '@jrmc/adonis-attachment/lucid'

@attachment()
declare avatar: AttachmentRelation

user.avatar.set(draft)
await user.save()
```

Use `@attachments()` with `AttachmentCollectionRelation` for collections. The explicit
`@attachmentRelation()` and `@attachmentsRelation()` names remain available as aliases.
In both modes, `serializeAs` no longer applies: relation accessors are not ordinary
Lucid columns and are not serialized automatically.
