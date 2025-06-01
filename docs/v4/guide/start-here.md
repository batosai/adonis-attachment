# Start Here

Simple upload file

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

---

```ts
// app/controllers/users_controller.ts
import { attachmentManager } from '@jrmc/adonis-attachment' // [!code focus]

class UsersController {
  public store({ request }: HttpContext) {
    const avatar = request.file('avatar')! // [!code focus]
    const user = new User()

    user.avatar = await attachmentManager.createFromFile(avatar) // [!code focus]
    await user.save()
  }
}
```

---

```edge
<img src="{{ await user.avatar.getUrl() }}" loading="lazy" alt="" />
```
