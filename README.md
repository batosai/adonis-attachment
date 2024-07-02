# AdonisJS attachment

This package is currently development and will replace [attachment-advanced](https://github.com/batosai/attachment-advanced) for AdonisJS 6.

## Roadmap

- [x] attachment file by file system
- [x] save meta data
- [ ] variantes
  - [ ] images
  - [ ] documents
  - [ ] videos
- [ ] command regenerate
- [ ] adonis-drive/flydrive
- [ ] jobs queue
- [ ] edge component

### File sytem

Upload file in public folder.

### Meta data list (if available)

- extension name
- size
- dimension (width, height)
- created date
- orientation
- mime type
- gps

### Variables

Configure differents images sizes and formats

### Regenerate

Regenerate variantes files

### Drive

Use drive for private file and cloud services

### Job

Couple with a job package

## Setup

Install and configure the package:

```sh
node ace add @jrmc/adonis-attachment
```

Or:

```sh
npm i @jrmc/adonis-attachment
node ace configure @jrmc/adonis-attachment
```

## Usage

Often times, the size of the image metadata could exceed the allowable length of an SQL `String` data type. So, it is recommended to create/modify the column which will hold the metadata to use a `JSON` data type.

If you are creating the column for the first time, make sure that you use the JSON data type. Example:

```ts
  // Within the migration file

  protected tableName = 'users'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments()
      table.json('avatar') // <-- Use a JSON data type
    })
  }
```

If you already have a column for storing image paths/URLs, you need to create a new migration and alter the column definition to a JSON data type. Example:

```bash
# Create a new migration file
node ace make:migration change_avatar_column_to_json --table=users
```

```ts
  // Within the migration file

  protected tableName = 'users'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.json('avatar').alter() // <-- Alter the column definition
    })
  }
```

Next, in the model, import the `attachment` decorator, `Attachmentable` mixin and the `Attachment` type from the package.

> Make sure NOT to use the `@column` decorator when using the `@attachment` decorator.

```ts
import { BaseModel } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { attachment, Attachmentable } from '@jrmc/adonis-attachment'
import type { Attachment } from '@jrmc/adonis-attachment/types'

class User extends compose(BaseModel, Attachmentable) {
  @attachment()
  public avatar: Attachment
}
```

Now you can create an attachment from the user uploaded file as follows.

```ts
import attachmentManager from '@jrmc/adonis-attachment/services/main'

class UsersController {
  public store({ request }: HttpContext) {
    const avatar = request.file('avatar')!
    const user = new User()

    user.avatar = await attachmentManager.createFromFile(avatar)
    // user.avatar = await attachmentManager.createFromBuffer(buffer, 'photo.jpg')
    await user.save()
  }
}
```

## Specifying subfolder

You can also store files inside the subfolder by defining the `folder` property as follows.

```ts
class User extends BaseModel {
  @attachment({ folder: 'avatars' })
  public avatar: Attachment
}
```
