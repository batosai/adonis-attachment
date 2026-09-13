# Adonis Attachment

File attachments for AdonisJS: upload files, generate image variants, and serve them from local or cloud storage. Use the optional Lucid integration to attach files to models, or manage persistence with your own data store.

> **Compatible with AdonisJS 7 only. Requires Node.js 24 or later.**

Version 6 is currently in **alpha**, published under the `next` tag.

**[Documentation](https://next.adonis-attachment.jrmc.dev)** · **[Migration from v5](https://next.adonis-attachment.jrmc.dev/migration/from-v5)**

## What's new in v6

Version 6 separates file storage, database persistence, and processing so you can choose the integrations your application needs.

- **Lucid is now optional.** Create and store attachments without an ORM, then save their data wherever you need. See [custom persistence](https://next.adonis-attachment.jrmc.dev/guide/custom-persistence).
- **Storage works independently of Drive.** Local filesystem storage is included by default. Use AdonisJS Drive for cloud disks, or provide your own storage adapter.
- **Creation and storage happen in two steps.** The manager creates a draft; `draft.persist()` writes the file and returns its attachment data. With Lucid, saving the model handles this step for you.
- **Lucid gets a relation API.** Dedicated attachment and ownership tables support singular attachments, collections, and sharing a file between records. Use methods such as `set()`, `get()`, and `detach()` to manage relations.
- **Queue integrations are optional.** An in-memory queue is included for variant processing; connect AdonisJS Queue when you need separate workers.

Existing v5 applications also have an experimental legacy integration for keeping JSON fields. Configuration and APIs have changed: follow the [migration guide](https://next.adonis-attachment.jrmc.dev/migration/from-v5) before upgrading.

## Quick start with Lucid

This example uses the Lucid integration to add an avatar to an existing `User` model in an AdonisJS 7 application with Lucid configured. For a setup without Lucid, follow the [custom persistence guide](https://next.adonis-attachment.jrmc.dev/guide/custom-persistence).

### 1. Install and configure

```sh
npm install @jrmc/adonis-attachment@next
node ace configure @jrmc/adonis-attachment
```

The configure command registers the provider and Ace commands and creates `config/attachment.ts`. Files are stored locally in `storage/attachments` by default.

### 2. Create the attachment tables

```sh
node ace make:attachments-table
node ace migration:run
```

These tables store file records and their links to your models. No `avatar` column is needed on `users`.

### 3. Add the model relation

Add the following import and property to your existing `User` model:

```ts
// app/models/user.ts
import { attachment, type AttachmentRelation } from '@jrmc/adonis-attachment/lucid'

// Inside the User class
@attachment()
declare avatar: AttachmentRelation
```

### 4. Handle an upload

```ts
// app/controllers/users_controller.ts
import type { HttpContext } from "@adonisjs/core/http";
import { attachmentManager } from "@jrmc/adonis-attachment";
import User from "#models/user";

export default class UsersController {
  async updateAvatar({ request, params, response }: HttpContext) {
    const user = await User.findOrFail(params.id);
    const file = request.file("avatar", {
      size: "5mb",
      extnames: ["jpg", "jpeg", "png", "webp"],
    });

    if (!file) return response.badRequest({ message: "Avatar is required" });
    if (!file.isValid) return response.badRequest({ errors: file.errors });

    const draft = await attachmentManager.createFromFile(file);
    user.avatar.set(draft);
    await user.save();

    const link = await user.avatar.get();
    return { url: `/attachments/${link!.attachmentId}` };
  }
}
```

`set()` stages the attachment; `user.save()` stores the file and persists the relation. Uploading again replaces the previous avatar.

### 5. Register the route and display the avatar

```ts
// start/routes.ts
import router from "@adonisjs/core/services/router";

const UsersController = () => import("#controllers/users_controller");

router.post("/users/:id/avatar", [UsersController, "updateAvatar"]);
```

Submit a `multipart/form-data` request with an `avatar` file to `/users/:id/avatar`, using an existing user's ID. The response contains a URL you can use as an image's `src`.

With Lucid configured, the package automatically registers `GET /attachments/:id/:name?` to serve stored files. This route is public; see [serving files](https://next.adonis-attachment.jrmc.dev/guide/serving-files) for protected attachments. Add your application's authentication, authorization, and CSRF handling to the upload route.

## Go further

- [Configuration](https://next.adonis-attachment.jrmc.dev/guide/configuration): local storage, AdonisJS Drive, and cloud disks.
- [Lucid integration](https://next.adonis-attachment.jrmc.dev/guide/lucid): collections, ownership, and persistence.
- [Image variants](https://next.adonis-attachment.jrmc.dev/guide/variants): thumbnails and conversions.
- [Background processing](https://next.adonis-attachment.jrmc.dev/guide/queues): in-memory processing or AdonisJS Queue workers.

## Migrating from v5

Version 6 introduces breaking changes to configuration and attachment APIs. Follow the [migration guide](https://next.adonis-attachment.jrmc.dev/migration/from-v5) to choose between keeping existing JSON fields with the experimental legacy integration or migrating them to attachment tables.

## License

MIT
