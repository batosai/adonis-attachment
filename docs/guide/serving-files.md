# Serving files

You have two ways to serve stored files back to users: the **built-in route** (quick, for
public assets) or your **own route** (for anything that needs authorization).

## The built-in route

When you configure a `repository`, the provider registers `GET /attachments/:id/:name?` at boot.
It resolves the attachment, reads its bytes from storage, and responds with the correct
`content-type`.

```ts
// config/attachment.ts
import { defineConfig, LocalFileStorage } from '@jrmc/adonis-attachment'
import { LucidAttachmentRepository } from '@jrmc/adonis-attachment/lucid'

export default defineConfig({
  storage: LocalFileStorage.fromApp,
  repository: new LucidAttachmentRepository(),
})
```

The `:id` is the **blob id** - for a Lucid relation, that's `link.attachmentId`:

```ts
const link = await user.avatar.get()
const url = link ? `/attachments/${link.attachmentId}` : null
```

Move or disable it:

```ts
route: false                     // no built-in route
route: { prefix: '/media/files' } // GET /media/files/:id/:name?
```

The optional `name` is ignored when resolving the file: the blob id remains the only lookup
key. It lets you expose URLs such as `/attachments/xxx/mon_fichier.jpeg` without breaking
the shorter URL. Use the stored filename and encode it as one URL segment:

```ts
const attachment = link?.attachment
const url = attachment
  ? `/attachments/${attachment.id}/${encodeURIComponent(attachment.name)}`
  : null
```

Without a `repository`, the route is simply not registered.

::: warning No authorization
The built-in route is **public** - anyone with an id can fetch the file, and an unknown id
returns `404`. The optional name does not protect the file. Only use it when ids are
acceptable as public identifiers.
:::

## Your own protected route

For private files, authorize first, then reuse the same building blocks the built-in route
uses - `AttachmentRepository.findById` and `AttachmentService.read`:

```ts
import type { HttpContext } from '@adonisjs/core/http'

export default class FilesController {
  async show({ params, response, auth, bouncer }: HttpContext) {
    const repository = await app.container.make('jrmc.attachment.repository')
    const service = await app.container.make('jrmc.attachment')

    const attachment = await repository.findById(params.id)
    if (!attachment) return response.notFound()

    // your authorization logic here
    await bouncer.authorize('viewFile', attachment)

    response.header('content-type', attachment.mimeType)
    return response.send(await service.read(attachment))
  }
}
```

Cache headers, download disposition, and signed URLs are yours to add as needed.

**Next:** [Background processing](/guide/queues).
