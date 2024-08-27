# Model setup

Next, in the model, import the `attachment` decorator, `Attachmentable` mixin and the `Attachment` type from the package.

> Make sure NOT to use the `@column` decorator when using the `@attachment` decorator.

```ts
import { BaseModel } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { attachment, Attachmentable } from '@jrmc/adonis-attachment'
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment' // [!code highlight]

class User extends compose(BaseModel, Attachmentable) { // [!code highlight]
  @attachment() // [!code highlight]
  declare avatar: Attachment // [!code highlight]
}
```

## Specifying subfolder

You can also store files inside the subfolder by defining the `folder` property as follows.

```ts
class User extends BaseModel {
  @attachment({ folder: 'uploads/avatars' }) // [!code highlight]
  declare avatar: Attachment
}
```

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

You can enabled pre compute the URLs after SELECT queries, default is false

```ts
class User extends BaseModel {
  @attachment({ preComputeUrl: true }) // [!code highlight]
  declare avatar: Attachment
}
```


## Specifying meta

You can disabled meta generation, default is true

```ts
class User extends BaseModel {
  @attachment({ meta: false }) // [!code highlight]
  declare avatar: Attachment
}
```

## Specifying rename

You can disabled rename file, default is true

```ts
class User extends BaseModel {
  @attachment({ rename: false }) // [!code highlight]
  declare avatar: Attachment
}
```


