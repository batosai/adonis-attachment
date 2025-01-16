# AdonisJS attachment

This package is currently development and will replace [attachment-advanced](https://github.com/batosai/attachment-advanced) for AdonisJS 6.

Project sample : [adonis-starter-kit](https://github.com/batosai/adonis-starter-kit)

## Links

[View documentation](https://adonis-attachment.jrmc.dev/)

[ChangeLog](https://adonis-attachment.jrmc.dev/changelog.html)

[Discord](https://discord.gg/89eMn2vB)

⚠️ [Breaking change](https://adonis-attachment.jrmc.dev/changelog.html) version 2, include [@adonisjs/drive](https://docs.adonisjs.com/guides/digging-deeper/drive)

## Roadmap

- [x] attachment file by file system
- [x] attachment file by buffer
- [x] attachment file by path
- [x] attachment file by url
- [x] attachment file by stream
- [x] save meta data
- [x] variantes
  - [x] images
  - [x] documents thumbnail
  - [x] videos thumbnail
- [ ] command regenerate
- [x] command make:convert
- [x] adonis-drive/flydrive
- [x] jobs queue
- [x] serialize


## Setup

Install and configure the package:

```sh
node ace add @jrmc/adonis-attachment
```

## Sample

Simple upload file

```ts
// app/models/user.ts
import { BaseModel } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { attachment, Attachmentable } from '@jrmc/adonis-attachment'
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment'

class User extends compose(BaseModel, Attachmentable) {
  @attachment()
  declare avatar: Attachment
}
```

---

```ts
// app/controllers/users_controller.ts
import { attachmentManager } from '@jrmc/adonis-attachment'

class UsersController {
  public store({ request }: HttpContext) {
    const avatar = request.file('avatar')!
    const user = new User()

    user.avatar = await attachmentManager.createFromFile(avatar)
    await user.save()
  }
}
```

---

```edge
<img src="{{ await user.avatar.getUrl() }}" loading="lazy" alt="" />
```

Read [documentation](https://adonis-attachment.jrmc.dev/) for advanced usage(thumbnail video/pdf/doc, create from buffer/base64...)
