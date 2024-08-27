# Controller setup

## From file

Now you can create an attachment from the user uploaded file as follows.

```ts
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

## From Buffer

```ts
import { attachmentManager } from '@jrmc/adonis-attachment' // [!code focus]
import app from '@adonisjs/core/services/app'

class UsersController {
  public store({ request }: HttpContext) {
    const user = new User()

    const buffer = await readFile(app.makePath('me.jpg'))

    user.avatar = await attachmentManager.createFromBuffer(buffer, 'photo.jpg') // [!code focus]
    await user.save()
  }
}
```
