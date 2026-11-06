# Read routes and disk isolation

Check the installed package declarations before migrating an older beta. The current
API registers `router.attachments()` on the Adonis router; it exposes no route until the
application calls that method. Remove the old `route` configuration key, including
`route: false`, which now causes a migration error.

## Select the storage and store

For two Drive disks, keep their existing configuration and visibility in `config/drive.ts`.
Select the Drive storage adapter and the application's store explicitly:

```ts
import { defineConfig, store, storage } from '@jrmc/adonis-attachment'

export default defineConfig({
  storage: storage.drive(),
  store: store.lucid(),
})
```

This example assumes Drive's default disk is `public`, alongside a `private` disk.
`storage.drive()` inherits that default from `config/drive.ts`; do not repeat
it with `defaultDisk` unless the application intentionally overrides it for attachments.

A custom store works equally well: the route requires `store.repository.findById`, not
Lucid. Keep disk names consistent with persisted metadata. Changing defaultDisk does not
move existing files or rewrite records.

## Declare the routes

Place route declarations in `start/routes.ts`, after the attachment provider is registered.
The method returns a native Adonis Route, supporting `.use()`, `.as()`, groups, prefixes,
domains and matchers. No name is assigned implicitly.

```ts
import router from '@adonisjs/core/services/router'
import type { HttpContext } from '@adonisjs/core/http'
import type { AttachmentRouteOptions } from '@jrmc/adonis-attachment'

// Application implementation: authenticate the caller and authorize params.id,
// including access to a variant's owner. Throw or reject access when forbidden.
declare function authorizeAttachment(context: HttpContext): Promise<void>

router.attachments().as('medias.show') // GET /attachments/:id/:name?, defaultDisk only

const privateFiles: AttachmentRouteOptions = { disks: ['private'] }
router
  .attachments('/documents/:id/:name?', privateFiles)
  .use(async (context, next) => {
    await authorizeAttachment(context)
    return next()
  })
  .as('documents.show')
```

Replace the declared authorization function with the application's real authentication
and authorization middleware. Do not create an allow-all stub. Authentication alone does
not authorize access to every private file. Middleware can resolve the requested blob
through `jrmc.attachment.repository` using `params.id`.

Without `disks`, the route allows only resolved defaultDisk: explicit attachment config,
then the storage adapter default, then `fs`. With Drive, the adapter default comes from
its configured disk override or the Drive default. `disks: ['photos', 'videos']` overrides
that selection. Empty lists and blank names are rejected at route declaration time.

A missing record or a disk outside the route's allowlist returns 404 before storage is
read. The list filters records; it does not select the disk for new uploads. Private disks
must also be inaccessible through public static URLs. Audit every declared route: an
unprotected route allowing a private disk bypasses the protection of another route.

## Uploads, IDs and variants

For a private upload, pass `{ disk: 'private' }` to the manager or configure the relation's
disk, then save through the appropriate persistence lifecycle. Public uploads inherit the
configured default. Preserve any existing explicit disk overrides.

`:id` is a blob ID, not a link ID, file path or v5 key. Use `link.attachmentId` or the
variant blob's own `id`. Name routes with `.as(...)` and use AdonisJS 7's `urlFor` from
`@adonisjs/core/services/url_builder`, for example
`urlFor('documents.show', { id: blob.id, name: blob.name })`. Do not concatenate route paths
or pre-encode parameters; the helper handles the optional cosmetic filename and escaping.
Edge has `urlFor` built in; Inertia uses the application's generated frontend URL builder. Legacy JSON references are not resolved by this route: use an authorized
owner-based controller or storage URLs for those fields.

`getUrl()` returns a storage URL; it does not build this route's URL. Issue signed storage
URLs only after authorization. The route does not generate missing variants on demand;
use the configured processing workflow and refresh persisted state.

## Verify integration

Check that public IDs succeed only on the public route and private IDs only on the private
route, with authorization. Check an unauthenticated request, another user's private blob,
an unknown ID, and a variant. Verify middleware still applies when routes are grouped.
Do not change stored disk metadata or storage visibility just to make a failing read pass.
