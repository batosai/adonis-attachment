# Model setup

Next, in the model, import the `attachment` decorator, `Attachmentable` mixin and the `Attachment` type from the package.

⚠️ [The "Attachmentable" mixin is deprecated in 3.2.0](/changelog#_3-2-0) 

> Make sure NOT to use the `@column` decorator when using the `@attachment` decorator.

```ts
import { BaseModel } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { attachment, Attachmentable } from '@jrmc/adonis-attachment' // [!code highlight]
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment' // [!code highlight]

class User extends compose(BaseModel, Attachmentable) { // [!code highlight]
  @attachment() // [!code highlight]
  declare avatar: Attachment // [!code highlight]
}
```

## Specifying folder

You can also store files inside the subfolder by defining the `folder` property as follows.

```ts
class User extends BaseModel {
  @attachment({ folder: 'uploads/avatars' }) // [!code highlight]
  declare avatar: Attachment
}
```

by path parameters (⚠️ [avalable in v3.3.0](/changelog#_3-3-0))

```ts
class User extends BaseModel {
  @column()
  declare name: string

  @attachment({ folder: 'uploads/:name/avatars' }) // [!code highlight]
  declare avatar: Attachment
}
```

Only parameters of the string type are allowed. Additionally, the following processes are performed:
- lowercase
- escape html
- no case
- slugify

custom  (⚠️ [avalable in v3.3.0](/changelog#_3-3-0))

```ts
class User extends BaseModel {
  @column()
  declare name: string

  @attachment({ folder: () => DateTime.now().toFormat('yyyy/MM') }) // [!code highlight]
  declare avatar: Attachment

  @attachment({ folder: (user: User) => user.name }) // [!code highlight]
  declare file: Attachment
}
```

⚠️ :id autoincrement parameter is not defined on first save


## Specifying variants

Generate variants

```ts
class User extends BaseModel {
  @attachment({
    variants: ['thumbnail', 'medium', 'large'] // [!code highlight]
  })
  declare avatar: Attachment
}
```

## Specifying disk

You can specify type of disk to use, default is defined in default adonis/drive config

```ts
class User extends BaseModel {
  @attachment({ disk: 's3' }) // [!code highlight]
  declare avatar: Attachment
}
```

## Specifying preComputeUrl

⚠️ [avalable in v2.2.0](/changelog#_2-2-0)

You can enabled pre compute the URLs after SELECT queries, default is false

```ts
class User extends BaseModel {
  @attachment({ preComputeUrl: true }) // [!code highlight]
  declare avatar: Attachment
}
```


## Specifying meta

⚠️ [avalable in v2.1.0](/changelog#_2-1-0)

You can disabled meta generation, default is true

```ts
class User extends BaseModel {
  @attachment({ meta: false }) // [!code highlight]
  declare avatar: Attachment
}
```

## Specifying rename

⚠️ [avalable in v2.1.0](/changelog#_2-1-0)

You can disabled rename file, default is true

```ts
class User extends BaseModel {
  @attachment({ rename: false }) // [!code highlight]
  declare avatar: Attachment
}
```

## `attachments` decorator

⚠️ [avalable in v3.3.0](/changelog#_3-3-0)

`attachments` decorator is a array of Attachment object, it'a accept all options of `attachment`

```ts
import { BaseModel } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { attachments } from '@jrmc/adonis-attachment'  // [!code highlight]
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment'

class User extends BaseModel {
  @attachments() // [!code highlight]
  declare files: Attachment[] | null
}
```


⚠️ Depending on the number of objects and processing, the `attachments` decorator can be very resource-intensive. I recommend using a HasMany relationship in Lucid to manage `attachment` decorator.
