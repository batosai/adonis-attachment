# AdonisJS attachment

This package is currently development and will replace [attachment-advanced](https://github.com/batosai/attachment-advanced) for AdonisJS 6.

Project sample : [adonis-starter-kit](https://github.com/batosai/adonis-starter-kit)

## Roadmap

- [x] attachment file by file system
- [x] save meta data
- [x] variantes
  - [x] images
  - [ ] documents thumbnail
  - [x] videos thumbnail
- [ ] command regenerate
- [x] adonis-drive/flydrive
- [ ] jobs queue
- [ ] edge component
- [x] serialize

⚠️ [Breaking change](https://github.com/batosai/adonis-attachment/blob/main/CHANGELOG.md), include [@adonisjs/drive](https://docs.adonisjs.com/guides/digging-deeper/drive)

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

### Variants

Configure differents images sizes and formats

### Regenerate (coming soon)

Regenerate variantes files

### Drive

Use [@adonisjs/drive](https://docs.adonisjs.com/guides/digging-deeper/drive) for private file and cloud services

### Jobs queue (coming soon)

Couple with a job queue (recommended, optional)

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
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment'

class User extends compose(BaseModel, Attachmentable) {
  @attachment()
  declare avatar: Attachment
}
```

Now you can create an attachment from the user uploaded file as follows.

```ts
import { attachmentManager } from '@jrmc/adonis-attachment'

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
  @attachment({ folder: 'uploads/avatars' })
  declare avatar: Attachment
}
```

## Specifying variants

It is possible to limit the variants on an attachment

```ts
class User extends BaseModel {
  @attachment({
    variants: ['thumbnail', 'medium', 'large']
  })
  declare avatar: Attachment
}
```

## URLs

```ts
await user.avatar.getUrl()
await user.avatar.getUrl('thumbnail')
// or await user.avatar.getVariant('thumbnail').getUrl()

await user.avatar.getSignedUrl()
await user.avatar.getSignedUrl('thumbnail')
// or await user.avatar.getVariant('thumbnail').getSignedUrl()
```

```edge
<img src="{{ await user.avatar.getUrl('thumbnail') }}" loading="lazy" alt="" />

<img src="{{ await user.avatar.getSignedUrl() }}" loading="lazy" alt="" />
<img src="{{ await user.avatar.getSignedUrl({
  expiresIn: '30 mins',
}) }}" loading="lazy" alt="" />

<img src="{{ await user.avatar.getSignedUrl('thumbnail') }}" loading="lazy" alt="" />
<img src="{{ await user.avatar.getSignedUrl('thumbnail', {
  expiresIn: '30 mins',
}) }}" loading="lazy" alt="" />
```

getSignedUrl options params accepts `expiresIn`, `contentType` et `contentDisposition`. [More informations](https://flydrive.dev/docs/disk_api#getsignedurl)


### by serialize

```ts
await user.avatar.toJSON()
```

```html
<img :src="user.avatar.thumbnail.url" loading="lazy" alt="" />
<img :src="user.avatar.thumbnail.signedUrl" loading="lazy" alt="" />
```

## Configuration

Configuration for variants files (config/attachment.ts)

```ts
import { defineConfig } from '@jrmc/adonis-attachment'
import app from '@adonisjs/core/services/app'
import sharp from 'sharp'

export default defineConfig({
  converters: [
    {
      key: 'thumbnail',
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        resize: 300,
        format: 'webp',
      }
    },
    {
      key: 'medium',
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        format: 'jpeg',
        resize: { // https://sharp.pixelplumbing.com/api-resize
          width: 400,
          height: 400,
          fit: sharp.fit.cover,
          position: 'top'
        },
      }
    },
    {
      key: 'large',
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        resize: 1024,
        format: {
          format: 'png',
          options: {
            quality: 80
          }
        }

      }
    },
    {
      key: 'preview',
      converter: () => import('@jrmc/adonis-attachment/converters/video_thumbnail_converter'),
      options: {
        format: 'jpeg',
        resize: 720
      }
    },
  ]
})
```

Variants images are generates by [sharp module](https://sharp.pixelplumbing.com)

Options resize is `number` or `object`(options) details in documentation : [sharp api resize](https://sharp.pixelplumbing.com/api-resize)

Options format is `string` or `object` [ format,  options ] details in documentation : [sharp api outpout](https://sharp.pixelplumbing.com/api-output#toformat)

```sh
npm install sharp
```

Variants thumbnail videos are generate by [fluent-ffmpeg](https://www.npmjs.com/package/fluent-ffmpeg)

By default, image format is PNG and size is video size. `options` attribute use image_converter (and sharp)

```sh
npm install fluent-ffmpeg
```
