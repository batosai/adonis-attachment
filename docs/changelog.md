# Changelog

## 2.3.0

* add [createFromBase64](/guide/basic_usage/controller-setup.html#from-base64)
* add [pdfConverter](/guide/converters/pdf-thumbnail)
* add [documentConverter](/guide/converters/document-thumbnail)

## 2.2.0

* add config preComputeUrl
* fix data serialize

## 2.1.0

* you may set the ffmpeg and ffprobe binary paths manually
* add config to disable meta
* add config to disable rename

## 2.0.2

* fix README
* fix documentation

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

## 1.1.0

* variantes videos thumbnail


## 1.0.1

* support AdonisJS 6
* attachment file by file system
* save meta data
* variantes images
* serialize
