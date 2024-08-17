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

|key       |Variant name              |
| -------- | ------------------------ |
|converter |Class for generate variant|
|options   |Options converter         |
