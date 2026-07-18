# Routes

The Adonis provider registers `GET /attachments/:id` during application boot by default. It resolves the attachment through the configured `AttachmentRepository`, reads its bytes from storage, and responds with the attachment MIME type.

Configure a repository before using the route:

```ts
// config/attachment.ts
import { defineConfig } from '@jrmc/adonis-attachment'
import { LucidAttachmentRepository } from '@jrmc/adonis-attachment/lucid'

export default defineConfig({
  defaultDisk: 'fs',
  storage: /* AttachmentStorage */,
  repository: new LucidAttachmentRepository(),
})
```

Without `repository`, the route cannot resolve attachment ids and the provider reports a configuration error when the route is called.

Set `route: false` to omit the built-in route, or change its prefix while preserving the `:id` parameter:

```ts
export default defineConfig({
  defaultDisk: 'fs',
  storage: /* AttachmentStorage */,
  repository: new LucidAttachmentRepository(),
  route: { prefix: '/media/files' }, // GET /media/files/:id
})
```

## Access control

The built-in route has no authorization middleware. Use it only when attachment ids are suitable as public identifiers. For protected files, define an application route that performs authorization first, then uses `AttachmentRepository.findById` and `AttachmentService.read` to produce the response.

An unknown id returns `404`. Successful responses set `content-type` from the attachment metadata. Cache headers, download disposition, signed URLs, and authorization remain application concerns.
