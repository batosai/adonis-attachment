# File URLs

An attachment can be reached through an **application route** or a **storage URL**.
Choose where the browser should fetch the file before choosing a method.

| Need | Use | URL comes from |
| --- | --- | --- |
| Serve a blob through Adonis, with optional middleware | `router.attachments()` and a blob-ID URL | Your application |
| Public original or variant on a singular Lucid relation | `user.avatar.getUrl(variant?, options?)` | Storage |
| Public URL for any plain attachment, including collection items | `attachmentService.getUrl(attachment)` | Storage |
| Temporary access after authorization | `attachmentService.getSignedUrl(attachment, options)` | Storage |
| Read an already computed public `.url` | `preComputeUrl: true` or `attachmentService.preComputeUrl(attachment)` | Storage |
| Original or variant retained in a legacy JSON field | Legacy `getUrl()` / `getSignedUrl()` | Storage |

**`getUrl()` never constructs a URL for `router.attachments()`.** It asks the storage
adapter for a URL. Registering a route does not change the result of `getUrl()`.

## Application route URLs

Declare the package route in `start/routes.ts`:

```ts
import router from '@adonisjs/core/services/router'

router.attachments().as('attachments.show')
```

Use AdonisJS 7's `urlFor` helper with the named route. Pass the blob ID, not the link ID:

```ts
import { urlFor } from '@adonisjs/core/services/url_builder'

const link = await user.avatar.get()
const url = link ? urlFor('attachments.show', { id: link.attachmentId }) : null
```

The optional filename is cosmetic. Pass the stored name directly; `urlFor` encodes
parameter values, so do not call `encodeURIComponent` yourself:

```ts
const attachment = link?.attachment
const namedUrl = attachment
  ? urlFor('attachments.show', { id: attachment.id, name: attachment.name })
  : null
```

A variant uses its own blob ID:

```ts
const variants = await user.avatar.variants()
const thumbnail = variants.find((variant) => variant.variantKey === 'thumbnail')
const thumbnailUrl = thumbnail
  ? urlFor('attachments.show', { id: thumbnail.id, name: thumbnail.name })
  : null
```

No route is registered automatically. The route allows only the resolved default disk
unless `disks` is supplied. With `storage.drive()`, the default is inherited
from Drive unless overridden for attachments. A missing blob or a blob outside the
allowed disks returns `404`.

Changing the route path or adding a group prefix does not require changing these calls;
keep the route name consistent. For the private route named `documents.show`, use
`urlFor('documents.show', { id: attachment.id, name: attachment.name })` after authorization.
If a route group adds a name prefix, use the resulting full route name.

In Edge templates, `urlFor` is available directly:

```edge
@if(attachment)
  <img src="{{ urlFor('attachments.show', { id: attachment.id, name: attachment.name }) }}" alt="Avatar" />
@end
```

For an absolute URL, pass the application's public origin through `prefixUrl`:

```ts
const absoluteUrl = urlFor('attachments.show', { id: attachment.id }, {
  prefixUrl: 'https://your-app.example',
})
```

Use your application's generated route registry for type-safe names and parameters. For
Inertia frontend code, use its generated URL builder rather than importing the backend
service into the browser. See the [AdonisJS URL builder guide](https://docs.adonisjs.com/guides/basics/url-builder).
The package registers routes; Adonis generates their URLs. `getUrl()` continues to mean
a storage URL. Signing an application URL with Adonis `signedUrlFor` is separate from
storage `getSignedUrl`: the receiving route must explicitly validate the signature.

Read [Serving files](/guide/serving-files) for route setup, public/private disk separation
and middleware. The blob-ID route does not resolve legacy JSON fields.

## Public storage URLs

### Singular Lucid relation

```ts
const originalUrl = await user.avatar.getUrl()
const thumbnailUrl = await user.avatar.getUrl('thumbnail')
const previewUrl = await user.avatar.getUrl('thumbnail', { fallback: 'original' })
```

The result is `Promise<string | null>`. An empty relation, missing variant without
fallback, or storage without public URL support returns `null`.

`fallback: 'original'` applies only when the variant has no persisted record, for example
while generation is pending. A persisted variant without a public URL still returns
`null`; storage errors propagate. The original may have a different MIME type, such as
a PDF instead of a thumbnail. Variant names use your typed `AttachmentVariantKey` keys.
This method does not check physical file existence or generate missing variants.

### Any attachment, including collection items

The root service accepts plain `Attachment` data, independently of the ORM. Convert a
Lucid link or blob model with `toAttachment()`:

```ts
import { attachmentService } from '@jrmc/adonis-attachment'

const links = await user.gallery.all()
const urls = await Promise.all(links.map((link) =>
  attachmentService.getUrl(link.toAttachment())
))
```

Use the same method for a singular link, a variant blob, or a plain attachment returned by
a custom store. The result is `Promise<string | undefined>`. A precomputed `attachment.url`
is reused when present; otherwise the service delegates to storage. Storage errors propagate.

### Storage requirements

- `AdonisDriveStorage` delegates to the file's Drive disk. Its URL and accessibility
  depend on that disk's backend and visibility.
- `LocalFileStorage` requires a configured `baseUrl` for public URLs. You must expose the
  files at that URL yourself; setting `baseUrl` does not register a static file server.
- A custom storage can implement `getUrl`. Without support, the service returns
  `undefined` and the singular relation returns `null`.

See [storage configuration](/guide/configuration#storage) for adapter setup.

## Signed storage URLs

Authorize the caller before generating temporary access:

```ts
import { attachmentService } from '@jrmc/adonis-attachment'

const link = await user.avatar.get()
if (link) {
  // Authenticate and authorize access to this attachment before this call.
  const url = await attachmentService.getSignedUrl(link.toAttachment(), {
    expiresIn: '10 mins',
  })
}
```

For a variant, pass that variant's `toAttachment()` instead. Options are forwarded to
the storage backend; supported expiration settings depend on that backend. A storage
without signed URL support returns `undefined`. The built-in `LocalFileStorage` does not
implement signed URLs.

These URLs point to storage, not to the package route, and bypass its middleware. The
application must authorize issuance. Generate them explicitly when needed; `preComputeUrl`
does not generate signed URLs.

## Precomputed public URLs

To populate `.url` during Lucid relation reads, enable the option on the relation:

```ts
@attachment({ preComputeUrl: true })
declare avatar: AttachmentRelation

const link = await user.avatar.get()
const url = link?.attachment.url
```

The option also applies to collection `all()` and singular `variants()` reads. URLs remain
in memory on the loaded blobs and are never persisted to the attachment tables. The
storage must still provide a public URL.

For plain attachment data, compute it explicitly:

```ts
const enriched = await attachmentService.preComputeUrl(attachment)
const url = enriched.url
```

This returns attachment data enriched with a public storage URL when available. It does
not create a route URL. Calling a relation's `getUrl()` directly does not require this option.

## Legacy JSON fields

For an `Attachment` imported from `/legacy`, methods resolve the original or a loaded
variant from the JSON snapshot:

```ts
const originalUrl = await user.avatar?.getUrl()
const thumbnailUrl = await user.avatar?.getUrl('thumbnail')
const originalSignedUrl = await user.avatar?.getSignedUrl({ expiresIn: '10 mins' })
const thumbnailSignedUrl = await user.avatar?.getSignedUrl('thumbnail', {
  expiresIn: '10 mins',
})
```

The methods return `undefined` when the variant or URL support is absent. Each item in
a legacy JSON collection exposes the same methods. `getVariant('thumbnail')` returns the
variant object, not a URL; use its `getUrl()` or `getSignedUrl()` method.

With `preComputeUrl: true`, `.url` and variant URLs are populated during model hydration
and appear in legacy serialization. An explicit `await user.avatar?.preComputeUrl()` also
populates them. These are public storage URLs, not signed URLs or blob-route URLs.
For owner-based authorization through your application, use a custom controller.

See [Legacy JSON fields](/guide/legacy) for persistence, snapshot freshness and serialization.
