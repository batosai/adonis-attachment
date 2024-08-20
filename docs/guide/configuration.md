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

### bin (optional)

You may set the ffmpeg, ffprobe and flvtool2/flvmeta binary paths manually:

```typescript
export default defineConfig({
  bin: { // [!code focus:5]
    ffmpegPath: 'ffmpeg_path',
    ffprobePath: 'ffprobe_path',
    flvtool2Path: 'flvtool2_path',
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
|flvtool2Path |Argument `path` is a string with the full path to the flvtool2 or flvmeta binary |
