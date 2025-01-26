# Changelog

## 3.2.0

* remove Attachmentable mixin
* add avif/heif type
* config: strict type format
* fix size attribute for createFromPath/createFromUrl
* fix extname and mimetype attributes for createFromPath/createFromUrl/createFromStream

> Released at *2025-01-23*

## 3.1.0

* add [createFromPath](/guide/basic_usage/controller-setup.html#from-path)
* add [createFromUrl](/guide/basic_usage/controller-setup.html#from-url)
* add [createFromStream](/guide/basic_usage/controller-setup.html#from-stream)
* add tests

> Released at *2025-01-15*

## 3.0.0

⚠️ BREAKING CHANGE

* feat: rework config structure
* feat: enhance typings

`/config/attachment.ts`:
::: code-group

```typescript [new]
import { defineConfig } from '@jrmc/adonis-attachment'
import { InferConverters } from '@jrmc/adonis-attachment/types/config'

const attachmentConfig = defineConfig({
  converters: {
    thumbnail: {
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        resize: 300,
      }
    }
  }
})

export default attachmentConfig

declare module '@jrmc/adonis-attachment' {
  interface AttachmentVariants extends InferConverters<typeof attachmentConfig> {}
}
```
```typescript [old]
import { defineConfig } from '@jrmc/adonis-attachment'

export default defineConfig({
  converters: [
    {
      key: 'thumbnail',
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        resize: 300,
      }
    }
  ]
})
```
:::

> Released at *2024-12-02*

## 2.4.2

* fix: issue [#2](https://github.com/batosai/adonis-attachment/issues/2), cannot read properties of undefined (reading 'getConfig') 
* fix: delete old file after option rename changed

> Released at *2024-11-09*

## 2.4.1

* fix: typo error mimetype -> mimeType

> Released at *2024-10-31*

## 2.4.0

* feat: use queue by Model attributes Attachment
* feat: ace command for generate converter

```sh
node ace configure @jrmc/adonis-attachment
```

or add `() => import('@jrmc/adonis-attachment/commands')` in array commands on `adonisrc.ts`

* doc: add [custom converter](/guide/advanced_usage/custom-converter)

> Released at *2024-10-14*

## 2.3.2

* fix: remove file after set attributes Attachment at null

> Released at *2024-10-02*

## 2.3.1

* fix: review exceptions
* doc: add [exception](/guide/advanced_usage/exceptions)

> Released at *2024-09-19*

## 2.3.0

* add [createFromBase64](/guide/basic_usage/controller-setup.html#from-base64)
* add [pdfConverter](/guide/converters/pdf-thumbnail)
* add [documentConverter](/guide/converters/document-thumbnail)

> Released at *2024-09-05*

## 2.2.0

* add config [preComputeUrl](/guide/basic_usage/model-setup.html#specifying-precomputeurl)
* fix data serialize

> Released at *2024-08-28*

## 2.1.0

* you may set the ffmpeg and ffprobe binary paths manually
* add config to disable [meta](/guide/basic_usage/model-setup.html#specifying-meta)
* add config to disable [rename](/guide/basic_usage/model-setup.html#specifying-rename)

> Released at *2024-08-22*

## 2.0.2

* fix README
* fix documentation

> Released at *2024-08-17*

## 2.0.1

⚠️ BREAKING CHANGE

* [@adonisjs/drive](https://docs.adonisjs.com/guides/digging-deeper/drive) is required

```sh
node ace add @adonisjs/drive
```

* `basePath` is deleted, replace by location option of fs service in drive config

config/attachment.ts

```typescript
import { defineConfig } from '@jrmc/adonis-attachment'
import app from '@adonisjs/core/services/app' // [!code --]

export default defineConfig({
  basePath: app.publicPath(), // [!code --]
  converters: [
    //...
  ]
})
```

sample config/drive.ts for compatibility old location attachment package version < 2.0.0

```typescript
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, services } from '@adonisjs/drive'

const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK'),

  services: {
    fs: services.fs({
      location: app.publicPath(), // [!code focus]
      serveFiles: true,
      routeBasePath: '/uploads',
      visibility: 'public',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}

```


* Refacto getUrl() view helper, add `await` word

```typescript
user.avatar.getUrl() // [!code --]
await user.avatar.getUrl() // [!code ++]
```

* Access serialize is update

```typescript
user.avatar.toJSON() // [!code --]
await user.avatar.toJSON() // [!code ++]
```

```html
<img :src="user.avatar.thumbnail" loading="lazy" alt="" /> // [!code --]
<img :src="user.avatar.thumbnail.url" loading="lazy" alt="" /> // [!code ++]
```

* dependencies update

> Released at *2024-08-17*

## 1.1.0

* variantes videos thumbnail

> Released at *2024-08-12*

## 1.0.1

* support AdonisJS 6
* attachment file by file system
* save meta data
* variantes images
* serialize

> Released at *2024-07-06*
