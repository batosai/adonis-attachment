# Quickstart

Let's add a user avatar to an AdonisJS 7 app: **upload it, store it, save it against a
`User`, and display it**, end to end. This uses the Lucid integration, the most common
setup. Prefer no ORM? See [custom persistence](/guide/custom-persistence).

::: tip Prerequisites
An AdonisJS 7 app with `@adonisjs/lucid` already installed and a `User` model.
:::

## 1. Install the package

```sh
node ace add @jrmc/adonis-attachment@next
```

`node ace add` creates `config/attachment.ts`, registers the provider, and wires up the
package commands. The default config stores files on the **local filesystem** under
`storage/attachments`. Data persistence is selected separately with `store`.

Select Lucid explicitly in the generated configuration (replace `store: false`):

```ts
import { defineConfig, LocalFileStorage } from '@jrmc/adonis-attachment'
import { LucidAttachmentStore } from '@jrmc/adonis-attachment/lucid'

export default defineConfig({
  storage: LocalFileStorage.fromApp,
  store: LucidAttachmentStore.fromApp,
})
```

## 2. Create the attachment tables

The Lucid integration keeps file data in an `adonis_attachments` table and ownership links in an
`adonis_attachment_links` table (more on that in [Core concepts](/guide/concepts)).

```sh
node ace make:attachments-table
node ace migration:run
```

## 3. Declare the relation on your model

```ts
// app/models/user.ts
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { attachment, type AttachmentRelation } from '@jrmc/adonis-attachment/lucid'

export default class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @attachment({
    folder: ({ model }) => `users/${model?.id}/avatar`,
  })
  declare avatar: AttachmentRelation
}
```

`avatar` is now a small helper object with methods like `set()`, `get()`, and `detach()`,
not a raw column.

## 4. Handle the upload

```ts
// app/controllers/users_controller.ts
import User from '#models/user'
import { attachmentManager } from '@jrmc/adonis-attachment'
import type { HttpContext } from '@adonisjs/core/http'

export default class UsersController {
  async updateAvatar({ request, params, response }: HttpContext) {
    const user = await User.findOrFail(params.id)

    const file = request.file('avatar', {
      size: '5mb',
      extnames: ['jpg', 'jpeg', 'png', 'webp'],
    })
    if (!file) return response.badRequest({ message: 'Avatar is required' })
    if (!file.isValid) return response.badRequest({ errors: file.errors })

    const draft = await attachmentManager.createFromFile(file)

    // Stage it on the relation, then flush it on save.
    user.avatar.set(draft)
    await user.save()

    const link = await user.avatar.get()
    return { attachmentId: link!.attachmentId }
  }
}
```

::: info What just happened
`set()` only stages the change. `user.save()` then flushes it: the file is written, the
blob and link rows are created, and, if a previous avatar existed, the old file is removed
after the new one is safely stored. You can also flush right away with
`await user.avatar.persist()`. If your controller runs inside a Lucid transaction, all of
this joins it.
:::

Register the upload action in `start/routes.ts`:

```ts
import router from '@adonisjs/core/services/router'

const UsersController = () => import('#controllers/users_controller')
router.post('/users/:id/avatar', [UsersController, 'updateAvatar'])
```

::: warning Application security
This minimal upload route does not authorize changes to a user. Add authentication and
check that the caller may update that user. If Shield CSRF protection applies, submit
a valid token through your application's form or authenticated test client. Do not
disable protection globally to run this example.
:::

## 5. Serve the avatar

Add the package's read route to `start/routes.ts`, alongside your upload route:

```ts
router.attachments().as('attachments.show')
```

This declares `GET /attachments/:id/:name?`. No read route is registered automatically.
It uses the Lucid store configured in step 1 to find the file by its blob ID, checks that
its disk is the configured `defaultDisk`, then returns the image with its MIME type.

Start the application with `node ace serve --hmr`, then upload to an existing user's ID:

```sh
curl -F 'avatar=@/absolute/path/avatar.png' http://localhost:3333/users/1/avatar
```

The response contains `attachmentId`. Use that value to open
`http://localhost:3333/attachments/<attachmentId>` in your browser. You can also use
this URL as an image's `src` in your application. The optional filename is cosmetic:
`/attachments/<attachmentId>/avatar.png` serves the same file.

In application code, generate the URL from the route name with Adonis's helper:

```ts
import { urlFor } from '@adonisjs/core/services/url_builder'

const link = await user.avatar.get()
const avatarUrl = link ? urlFor('attachments.show', { id: link.attachmentId }) : null
```

`urlFor` uses the declared path and encodes parameters. In Edge templates, the same
helper is available without an import. See [File URLs](/guide/urls#application-route-urls)
for filenames, variants and absolute URLs.

A missing blob or a blob on another disk returns `404`. Repeat the upload to test avatar
replacement; use the new `attachmentId` returned by the upload action.

::: warning Public and private files
This route has no authorization and is intended for public avatars. For private files,
declare a separate route with `{ disks: ['private'] }` and attach your application's
authentication and per-file authorization middleware with `.use(...)`.
See [Serving files](/guide/serving-files#separate-public-and-private-disks).
:::

## 6. Optional: expose the avatar through a transformer

For an API or Inertia app, add the avatar URL to an Adonis transformer. This example
reuses the public `attachments.show` route from step 5 and returns `null` when the user
has no avatar. It does not require `preComputeUrl` or a public storage URL.

```sh
node ace make:transformer user
```

If a user transformer already exists, add the avatar field to it rather than replacing
its existing output:

```ts
// app/transformers/user_transformer.ts
import { BaseTransformer } from '@adonisjs/core/transformers'
import { urlFor } from '@adonisjs/core/services/url_builder'
import type User from '#models/user'

export default class UserTransformer extends BaseTransformer<User> {
  async toObject() {
    const link = await this.resource.avatar.get()
    const attachment = link?.attachment

    return {
      ...this.pick(this.resource, ['id']),
      avatarUrl: attachment
        ? urlFor('attachments.show', { id: attachment.id, name: attachment.name })
        : null,
    }
  }
}
```

The attachment accessor is asynchronous, so `toObject()` is asynchronous too. The
transformer exposes only the selected user fields and the URL, rather than sending the
attachment's disk, path or relation accessor to the client.

### API response

In an application with the Adonis serializer configured, add this action to
`UsersController` and import `UserTransformer` from `#transformers/user_transformer`:

```ts
async show({ params, serialize }: HttpContext) {
  const user = await User.findOrFail(params.id)
  return serialize(UserTransformer.transform(user))
}
```

Register `router.get('/users/:id', [UsersController, 'show'])`. The serialized user
contains `id` and `avatarUrl`; the response wrapper follows your application's serializer
configuration. The client can use `avatarUrl` as an image's `src`.

### Inertia page

For an Inertia application, pass the same transformer directly to `inertia.render()`:

```ts
async showPage({ params, inertia }: HttpContext) {
  const user = await User.findOrFail(params.id)
  return inertia.render('users/show', {
    user: UserTransformer.transform(user),
  })
}
```

Register `router.get('/users/:id', [UsersController, 'showPage'])` instead of the API
route above, and create the `users/show` Inertia page. Inertia serializes the transformer;
the page receives `user.id` and `user.avatarUrl`. For example, in a Vue page:

```vue
<img v-if="user.avatarUrl" :src="user.avatarUrl" alt="Avatar" />
```

Use your application's existing authentication and user-view authorization for either
action. This example exposes public avatars; private files still require an authorized
file route even when their URL is returned by a transformer.

See [Adonis transformers](https://docs.adonisjs.com/guides/frontend/transformers) for
serializer setup and Inertia type generation, and [File URLs](/guide/urls) for other URL sources.

## You're done

You uploaded, stored, persisted, and served a file. From here:

- **[File URLs](/guide/urls)** to choose between route URLs, storage URLs and signed URLs.
- **[Image variants](/guide/variants)** to generate thumbnails automatically.
- **[Core concepts](/guide/concepts)** to understand what happens under the hood.
- **[Creating attachments](/guide/creating-attachments)** for all the input sources.
