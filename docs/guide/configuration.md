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
