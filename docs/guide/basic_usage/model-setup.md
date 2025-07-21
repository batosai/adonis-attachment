# Model setup

Next, in the model, import the `attachment` decorator and the `Attachment` type from the package.

> Make sure NOT to use the `@column` decorator when using the `@attachment` decorator.

```ts
import { BaseModel } from '@adonisjs/lucid/orm'
import { attachment } from '@jrmc/adonis-attachment' // [!code highlight]
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment' // [!code highlight]

class User extends BaseModel { // [!code highlight]
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

by path parameters (⚠️ [avalable in v4.0.0](/changelog#_4-0-0))

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

custom  (⚠️ [avalable in v4.0.0](/changelog#_4-0-0))

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

::: info
`:id` autoincrement parameter is not defined on first save
:::


## Specifying variants

Generate variants after create entity

Optionnal if when using the [route](/guide/basic_usage/route-setup.html). But it allows pre-generation

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

::: info
Alternate : please look the new [route](/guide/basic_usage/route-setup.html)
:::


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

custom (⚠️ [avalable in v5.0.0](/changelog#_5-0-0))

`rename` can take a function for customization.

```ts
class User extends BaseModel {
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string // UUID

  @attachment({ rename: () => 'my-attachment.jpg' }) // [!code highlight]
  declare avatar: Attachment

  // or

  @attachment({ rename: () => ':id.jpg' }) // [!code highlight]
  declare avatar: Attachment

  // or

  @attachment({ rename: async (user: User) => { // [!code highlight]
    return crypto.randomUUID() // [!code highlight]
  }}) // [!code highlight]
  declare avatar: Attachment
}
```

::: info

option `:model_attribut`

`:id` autoincrement parameter is not defined on first save
:::

## Re-naming properties

⚠️ [avalable in v4.0.0](/changelog#_4-0-0)

[Just like the other Lucid attributes](https://lucid.adonisjs.com/docs/serializing-models#re-naming-properties), you can rename the serialized property names by using the  `serializeAs` option. You will still access the property by its actual name on the model, but the serialized output will use the `serializeAs` name. For example:

```ts
@attachment({
  serializeAs: 'avatar', // [!code highlight]
})
declare file: Attachment | null

/**
 {
  avatar: {
    "name": 'lj9kbwvb8gqq8pjsmuog369l.jpg',
    "originalName": 'photo_2023-11-19_00-21-49.jpg',
    "size": 201654,
    "extname": 'jpg',
    "mimeType": 'image/jpeg',
    ...
  }
 } 
*/
```

## Hiding properties

⚠️ [avalable in v4.0.0](/changelog#_4-0-0)

You can remove the model properties from the serialized output by setting the serializeAs value to null. For example:

```ts
@attachment({
  serializeAs: null, // [!code highlight]
})
declare file: Attachment | null
```

## Serialize

⚠️ [avalable in v4.0.0](/changelog#_4-0-0)

You can customize the output of a serialize. For example:

```ts
@attachments({
  preComputeUrl: true,
  serialize: (value?: Attachment) => value?.url ?? null // [!code highlight]
})
declare avatar: Attachment | null

/**
 {
  avatar: '/uploads/lj9kbwvb8gqq8pjsmuog369l.jpg',
 } 
*/
```

or for assets route (⚠️ [avalable in v5.0.0](/changelog#_5-0-0))

```ts
@attachments({
  serialize: (value?: Attachment) => {
    if (value) {
      return `assets/${value.keyId}` // [!code highlight]
    }
    return null
  }
})
declare avatar: Attachment | null

/**
 {
  avatar: '/assets/[keyId]',
 } 
*/
```

## `attachments` decorator

⚠️ [avalable in v4.0.0](/changelog#_4-0-0)

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
