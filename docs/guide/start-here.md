# Start Here

Basic sample, user avatar

```sh
node ace add @jrmc/adonis-attachment
```


```sh
# Create a new migration file
node ace make:migration change_avatar_column_to_json --table=users
```

```ts
// Within the migration file
protected tableName = 'users'

public async up() {
  this.schema.alterTable(this.tableName, (table) => {
    table.json('avatar').alter() // [!code highlight]
  })
}
```

```ts
// start/routes.ts
import router from '@adonisjs/core/services/router'
const AssetsController = () => import('@jrmc/adonis-attachment/controllers/assets_controller') // [!code highlight]

router.get('/assets/:key', [AssetsController]) // [!code highlight]
```

```ts
// app/models/user.ts
import { BaseModel } from '@adonisjs/lucid/orm'
import { attachment } from '@jrmc/adonis-attachment'
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment' // [!code highlight]

class User extends BaseModel {
  @attachment() // [!code highlight]
  declare avatar: Attachment // [!code highlight]
}
```

```ts
// app/controllers/users_controller.ts
import { attachmentManager } from '@jrmc/adonis-attachment' // [!code highlight]

class UsersController {
  public store({ request }: HttpContext) {
    const avatar = request.file('avatar')!
    const user = new User()

    user.avatar = await attachmentManager.createFromFile(avatar) // [!code highlight]
    await user.save()
  }
}
```

```edge
<img src="/assets/{{ user.avatar.keyId }}" loading="lazy" alt="" />
```

---

Thumbnail

::: code-group
```sh [npm]
npm install sharp
```
```sh [pnpm]
pnpm install sharp
```
```sh [yarn]
yarn add sharp
```
:::

```ts
// config/attachment.ts
import { defineConfig } from '@jrmc/adonis-attachment'
import { InferConverters } from '@jrmc/adonis-attachment/types/config'

const attachmentConfig = defineConfig({
  converters: {
    thumbnail: { // [!code highlight]
      format: 'webp', // [!code highlight]
      resize: 300, // [!code highlight]
    } // [!code highlight]
  }
})
...

```

```edge
<img src="/assets/{{ user.avatar.keyId }}?variant=thumbnail" loading="lazy" alt="" />
```