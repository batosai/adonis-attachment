# General configuration 

⚠️ [change in v3.0.0](/changelog#_3-0-0)

Attachment configuration is located in the `config/attachment.ts` file. By default, the file looks like this:

```typescript
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

## converters

|OPTIONS:  | DESCRIPTIONS:            |
| -------- | ------------------------ |
|converter |Class for generate variant|
|options   |Options converter         |

---

## preComputeUrl (optional, default false)

enable the preComputeUrl flag to pre compute the URLs after SELECT queries.

```typescript
const attachmentConfig = defineConfig({
  preComputeUrl: true, // [!code focus]
  converters: {
    // ...
  }
})
```

## meta (optional, default true)

you can set the default meta generation or not

```typescript
const attachmentConfig = defineConfig({
  meta: false, // [!code focus]
  converters: {
    // ...
  }
})
```

---

## rename (optional, default true)

You can define by default if the files are renamed or not.

```typescript
const attachmentConfig = defineConfig({
  rename: false, // [!code focus]
  converters: {
    // ...
  }
})
```

---

## bin (optional)

You may set the ffmpeg and ffprobe binary paths manually:

```typescript
const attachmentConfig = defineConfig({
  bin: { // [!code focus:8]
    ffmpegPath: 'ffmpeg_path', // the full path of the binary
    ffprobePath: 'ffprobe_path', // the full path of the binary
    pdftocairoBasePath: 'base_dir_path' // the path of the directory containing the binary
    libreofficePaths: [
      'libreoffice_path', // the full path of the binary
    ] // Array of paths to LibreOffice binary executables.
  },
  converters: {
    // ...
  }
})
```


|OPSTIONS           |DESCRIPTIONS:                                                                       |
| ----------------- | ---------------------------------------------------------------------------------- |
|ffmpegPath         |Argument `path` is a string with the full path to the ffmpeg binary                 |
|ffprobePath        |Argument `path` is a string with the full path to the ffprobe binary                |
|pdftocairoBasePath |Argument `path` is a string with the path of the directory to the pdftocairo binary |
|libreofficePaths   |Array of `paths` to LibreOffice binary executables                                  |


### sample

[download ffmpeg](https://ffbinaries.com/downloads) and ffprobe binary in /bin. Add execution right.

```sh
cd bin
chmod +x ffmpeg
chmod +x ffprobe
```

```typescript
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@jrmc/adonis-attachment'
import { InferConverters } from '@jrmc/adonis-attachment/types/config'

const attachmentConfig = defineConfig({
  bin: { // [!code focus:4]
    ffmpegPath: app.makePath('bin/ffmpeg'),
    ffprobePath: app.makePath('bin/ffprobe'),
  },
  converters: [
    // ...
  ]
})

export default attachmentConfig

declare module '@jrmc/adonis-attachment' {
  interface AttachmentVariants extends InferConverters<typeof attachmentConfig> {}
}
```

## queue concurrency (optional)

The convert processing is carried out async in a queue

By default, 1 task is processed concurrently. 1 task corresponds to a model attribute. For example, if a model has a logo attribute and an avatar attribute, this represents 2 tasks whatever the number of concert per attribute.

```typescript
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@jrmc/adonis-attachment'
import { InferConverters } from '@jrmc/adonis-attachment/types/config'

const attachmentConfig = defineConfig({
  queue: { // [!code focus:3]
    concurrency: 2
  },
  converters: {
    // ...
  }
})

export default attachmentConfig

declare module '@jrmc/adonis-attachment' {
  interface AttachmentVariants extends InferConverters<typeof attachmentConfig> {}
}
```
