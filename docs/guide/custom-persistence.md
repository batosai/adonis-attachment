# Custom Persistence

Lucid is not required. Create a draft, persist it explicitly, then store the resulting `Attachment` with the ORM or data store used by the application.

```ts
import { attachmentManager } from "@jrmc/adonis-attachment";

const attachment = await attachmentManager.createFromBuffer(fileBytes, {
  originalName: "profile.jpg",
  mimeType: "image/jpeg",
  folder: `users/${user.id}`,
});

await attachment.persist();

await database.userMedia.create({
  data: {
    userId: user.id,
    attachmentId: attachment.id,
    disk: attachment.disk,
    path: attachment.path,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
  },
});
```

Keep the attachment id, disk, path, and file metadata required by the application. The package does not require a particular schema or relationship model.

## Jobs and reads

Variant jobs and the built-in read route resolve files through `AttachmentRepository`. Implement it against the application data store when those features are needed:

```ts
import type { AttachmentRepository } from "@jrmc/adonis-attachment";

export class UserMediaRepository implements AttachmentRepository {
  async findById(id: string) {
    const media = await database.userMedia.findUnique({
      where: { attachmentId: id },
    });

    if (!media) {
      return null;
    }

    return {
      id: media.attachmentId,
      disk: media.disk,
      path: media.path,
      name: media.name,
      originalName: media.originalName,
      mimeType: media.mimeType,
      extname: media.extname,
      size: media.size,
    };
  }
}
```

Pass that repository to `defineConfig` for background processing and the optional read route. Variant persistence remains application-owned unless the Lucid integration is selected.
