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

## From files

Now you can create an attachments from the user uploaded files as follows.

⚠️ [avalable in v4.0.0](/changelog#_4-0-0)


```ts
import { attachmentManager } from '@jrmc/adonis-attachment' // [!code focus]

class UsersController {
  public store({ request }: HttpContext) {
    const files = request.files('files')! // [!code focus]
    const user = new User()

    user.files = await attachmentManager.createFromFiles(files) // [!code focus]
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

    const buffer = await readFile(app.makePath('me.jpg')) // [!code focus]

    user.avatar = await attachmentManager.createFromBuffer(buffer, 'photo.jpg') // [!code focus]
    await user.save()
  }
}
```

## From Base64

⚠️ [avalable in v2.3.0](/changelog#_2-3-0)

```ts
import { attachmentManager } from '@jrmc/adonis-attachment' // [!code focus]

class UsersController {
  public store({ request }: HttpContext) {
    const user = new User()

    const b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII=" // [!code focus]

    user.avatar = await attachmentManager.createFromBase64(b64, 'photo.jpg') // [!code focus]
    await user.save()
  }
}
```

## From Path

⚠️ [avalable in v3.1.0](/changelog#_3-1-0)

```ts
import { attachmentManager } from '@jrmc/adonis-attachment' // [!code focus]
import app from '@adonisjs/core/services/app'

class UsersController {
  public store({ request }: HttpContext) {
    const user = new User()

    const path = app.makePath('me.jpg') // [!code focus]

    user.avatar = await attachmentManager.createFromPath(path, 'photo.jpg') // [!code focus]
    await user.save()
  }
}
```

## From Url

⚠️ [avalable in v3.1.0](/changelog#_3-1-0)

```ts
import { attachmentManager } from '@jrmc/adonis-attachment' // [!code focus]

class UsersController {
  public store({ request }: HttpContext) {
    const user = new User()

    const url = new URL('https://site.com/picture.jpg') // [!code focus]

    user.avatar = await attachmentManager.createFromUrl(url, 'photo.jpg') // [!code focus]
    await user.save()
  }
}
```

## From Stream

⚠️ [avalable in v3.1.0](/changelog#_3-1-0)

```ts
import { attachmentManager } from '@jrmc/adonis-attachment' // [!code focus]
import fs from 'node:fs'

class UsersController {
  public store({ request }: HttpContext) {
    const user = new User()

    const videoStream = fs.createReadStream(app.makePath('path/video.mkv')) // [!code focus]

    user.avatar = await attachmentManager.createFromStream(videoStream, 'name.mkv') // [!code focus]
    await user.save()
  }
}
```

## Delete Attachment


::: code-group
```ts [model]
class User extends BaseModel { 
  @attachment()
  declare avatar: Attachment | null
}
```

```ts [controller]
user.avatar = null
await user.save()
```

:::
