# General configuration 

Attachment configuration is located in the `config/auditing.ts` file. By default, the file looks like this:

```typescript
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

### converters

|OPTIONS:  | DESCRIPTIONS:            |
| -------- | ------------------------ |
|key       |Variant name              |
|converter |Class for generate variant|
|options   |Options converter         |

---

### meta (optional, default true)

you can set the default meta generation or not

```typescript
export default defineConfig({
  meta: false, // [!code focus],
  converters: [
    // ...
  ]
})
```

---

### rename (optional, default true)

You can define by default if the files are renamed or not.

```typescript
export default defineConfig({
  rename: false, // [!code focus],
  converters: [
    // ...
  ]
})
```

---

### bin (optional)

You may set the ffmpeg and ffprobe binary paths manually:

```typescript
export default defineConfig({
  bin: { // [!code focus:5]
    ffmpegPath: 'ffmpeg_path',
    ffprobePath: 'ffprobe_path',
  },
  converters: [
    // ...
  ]
})
```


|OPSTIONS     |DESCRIPTIONS:                                                                    |
| ----------- | ------------------------------------------------------------------------------- |
|ffmpegPath   |Argument `path` is a string with the full path to the ffmpeg binary              |
|ffprobePath  |Argument `path` is a string with the full path to the ffprobe binary             |
