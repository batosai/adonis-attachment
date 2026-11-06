# Serving files

This page covers HTTP route setup and access control. For the complete URL reference,
see [File URLs](/guide/urls).

The package extends the Adonis router with `router.attachments()`. No HTTP route is
registered automatically. Declare the routes you need in `start/routes.ts`.

## Public files

Configure a store with a repository, such as `store.lucid()`, then declare:

```ts
import router from '@adonisjs/core/services/router'

router.attachments().as('attachments.show')
// GET /attachments/:id/:name?
```

The route allows only the configured `defaultDisk` (the storage default, or `fs`, when
not explicitly configured). It resolves the file through `store.repository.findById`,
checks its disk, reads its bytes from storage and sends the stored MIME type.
A missing record or a file on another disk returns `404`, without reading its bytes.
A custom store works too; this route does not depend on Lucid.

The ID is the blob ID: for a Lucid relation, use `link.attachmentId`, not `link.id`.
Variants have their own blob IDs and use the same route. Legacy JSON fields require
storage URLs or an owner-based application route; this route does not resolve them.

```ts
import { urlFor } from '@adonisjs/core/services/url_builder'

const link = await user.avatar.get()
const attachment = link?.attachment
const url = attachment
  ? urlFor('attachments.show', { id: attachment.id, name: attachment.name })
  : null
```

Adonis encodes the parameters and follows the named route's configured path.
The optional name is cosmetic and ignored during lookup. Both `/attachments/abc` and
`/attachments/abc/photo.jpg` resolve the same file.

For all ways to obtain a URL, see [File URLs](/guide/urls): route URLs, direct storage
URLs, signed URLs and precomputed `.url`. Storage `getUrl()` methods do not construct
URLs for `router.attachments()`.

## Separate public and private disks

Each route can override the allowed disks. Disk names have no special meaning to the
package: configure your public and private disks in Drive and use their actual names.

Use the Drive storage adapter. It inherits the default disk from `config/drive.ts`:

```ts
// config/attachment.ts
import { defineConfig, store, storage } from '@jrmc/adonis-attachment'

export default defineConfig({
  storage: storage.drive(),
  store: store.lucid(),
})
```

This example assumes `config/drive.ts` declares `public` and `private` disks, with `public`
as its default. There is no need to repeat that choice with `defaultDisk` in the attachment
configuration; use that optional key only to override the default for attachments. The private
disk must not serve files publicly; the disk names alone do not configure visibility.
A custom store with a repository can replace the Lucid store in this example.

```ts
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .attachments('/medias/:id/:name?', { disks: ['public'] })
  .as('medias.show')

router
  .attachments('/documents/:id/:name?', { disks: ['private'] })
  .use([middleware.auth(), middleware.canReadAttachment()])
  .as('documents.show')
```

Public uploads use `defaultDisk`. Select the private disk when creating a private draft:

```ts
const draft = await attachmentManager.createFromFile(file, { disk: 'private' })
user.document.set(draft)
await user.save()
```

Here `user.document` is an application-defined Lucid attachment relation. Its resulting
blob ID belongs in `/documents/<id>`, not `/medias/<id>`. The route's `disks` option filters
stored records; it does not change the upload disk or move any file. Existing records
keep their disk even if you later change `defaultDisk`.

`canReadAttachment` is an application middleware you must implement and register. It
must verify that the authenticated user may read the requested attachment (including
variant access). Authentication alone does not grant permission to every private file.
It can look up the attachment using `jrmc.attachment.repository` and `ctx.params.id`.

The public route returns `404` for private-disk IDs, and the private route returns `404`
for public-disk IDs. A route can allow several disks with `disks: ['photos', 'videos']`.
An empty list or an empty disk name is rejected when declaring the route.

The method returns a native Adonis `Route`: middleware, groups, prefixes, domains,
matchers and `.as()` behave as for `router.get()`. No route name is assigned implicitly.

::: warning Storage visibility
The private disk must not expose files through a public static URL. Restrict every
attachment route to the intended disks: any unprotected route allowing the private disk
would expose those files. Disks select the files a route can serve; middleware controls
who may access them.
:::

## Application controllers

For owner-based authorization or custom responses, an application controller can use
`AttachmentRepository.findById` and `AttachmentService.read` directly. Authorize the
attachment before reading its bytes. Cache headers, download disposition and signed
storage URLs remain under application control. Authorize before issuing a signed URL.

## Migrating from automatic routes

Remove `route` from `config/attachment.ts`. It is no longer supported and produces a
migration error. Replace the automatic route or `route: { prefix: '/media' }` with an
explicit `router.attachments('/media/:id/:name?')` declaration. For the former
`route: false`, simply omit the declaration. Check that the route allows the disks your
application previously served: the default now allows only `defaultDisk`.

**Next:** [Background processing](/guide/queues).
