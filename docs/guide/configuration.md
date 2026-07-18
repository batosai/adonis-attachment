# Configuration

The attachment service needs a disk name and a storage adapter. The queue is optional: without one, the package uses `MemoryAttachmentQueue`.

```ts
// config/attachment.ts
import drive from '@adonisjs/drive/services/main'
import { AdonisDriveStorage, defineConfig } from '@jrmc/adonis-attachment'

export default defineConfig({
  defaultDisk: 'fs',
  storage: new AdonisDriveStorage(drive),
})
```

Applications that do not use Drive can provide any object implementing `AttachmentStorage`. A custom queue implements `AttachmentQueue` and receives serializable attachment jobs.

For in-process variant generation, pass an `AttachmentJobProcessor` as `processor`. The default memory queue delegates every job to it.

To enable the built-in `GET /attachments/:id` route, provide an `AttachmentRepository` as `repository`. See [Routes](/guide/routes) for its response behavior and access-control considerations.

The storage adapter must implement `write`, `read`, and `remove`. `read` returns the source bytes used by media converters. `AdonisDriveStorage` maps these operations to the selected Drive disk.
