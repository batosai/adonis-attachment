# Quickstart

Let's add a user avatar to an AdonisJS 7 app: **upload it, store it, save it against a
`User`, and display it**, end to end. This uses the Lucid integration, the most common
setup. Prefer no ORM? See [custom persistence](/guide/custom-persistence).

::: tip Prerequisites
An AdonisJS 7 app with `@adonisjs/lucid` already installed and a `User` model.
:::

## 1. Install the package

```sh
node ace add @jrmc/adonis-attachment
```

`node ace add` creates `config/attachment.ts`, registers the provider, and wires up the
package commands. The default config stores files on the **local filesystem** under
`storage/attachments`, with nothing else to set up.

## 2. Create the attachment tables

The Lucid integration keeps file data in an `attachments` table and ownership links in an
`attachment_links` table (more on that in [Core concepts](/guide/concepts)).

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

## 5. Display it

First register the upload action in `start/routes.ts`:

```ts
import router from '@adonisjs/core/services/router'

const UsersController = () => import('#controllers/users_controller')
router.post('/users/:id/avatar', [UsersController, 'updateAvatar'])
```

Start the application with `node ace serve --hmr`, then upload to an existing user's ID:

```sh
curl -F 'avatar=@/absolute/path/avatar.png' http://localhost:3333/users/1/avatar
```

The response contains the blob's `attachmentId`. Open `/attachments/<attachmentId>`
on the same server to check the stored image. Repeat the upload to test replacement.
Size and extension validation belongs to the application, not attachment persistence.

::: warning Application security
This minimal test route does not authorize changes to a user. Add authentication and
check that the caller may update that user. If Shield CSRF protection applies, submit
a valid token through your application's form or authenticated test client. Do not
disable protection globally to run this example.
:::

When Lucid is registered in the application, the package detects its `lucid.db` container
binding and enables the built-in read route automatically. No additional attachment
configuration is required:

```ts
// config/attachment.ts
import { defineConfig, LocalFileStorage } from '@jrmc/adonis-attachment'

export default defineConfig({
  storage: LocalFileStorage.fromApp,
})
```

For an application using Edge, add this action to `UsersController`:

```ts
async show({ params, view }: HttpContext) {
  const user = await User.findOrFail(params.id)
  const link = await user.avatar.get() // AttachmentLinkModel | null
  const attachment = link?.attachment
  const avatarUrl = attachment
    ? `/attachments/${attachment.id}/${encodeURIComponent(attachment.name)}`
    : null

  return view.render('users/show', { user, avatarUrl })
}
```

Register `router.get('/users/:id', [UsersController, 'show'])` alongside the upload route,
and create `resources/views/users/show.edge`:

```edge
@if(avatarUrl)
  <img src="{{ avatarUrl }}" alt="Avatar" />
@end
```

::: warning The built-in route is public
`GET /attachments/:id/:name?` has no authorization. It's fine for public assets. For protected
files, build your own route. See [Serving files](/guide/serving-files).
:::

## You're done

You uploaded, stored, persisted, and served a file. From here:

- **[Image variants](/guide/variants)** to generate thumbnails automatically.
- **[Core concepts](/guide/concepts)** to understand what happens under the hood.
- **[Creating attachments](/guide/creating-attachments)** for all the input sources.
