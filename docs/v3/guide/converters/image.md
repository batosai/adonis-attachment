# Image converter

<!--@include: ../partials/install-image.md-->

## Configuration

```typescript
// config/attachment.ts // [!code focus:1]
const attachmentConfig = defineConfig({
  converters: {
    large: { // [!code focus:6]
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'), 
      options: {
        resize: 1280,
      }
    }
  }
})
```

## Format

The default format is `webp`, for change, use options format: 

```typescript
const attachmentConfig = defineConfig({
  converters: {
    thumbnail: { // [!code focus:7]
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        resize: 300,
        format: 'jpeg', // [!code highlight]
      }
    }
  }
})
```

Options format is `string` or `object` [ format,  options ] details in documentation : [sharp api outpout](https://sharp.pixelplumbing.com/api-output#toformat)


Sample for personalize image quality: 

```typescript{8-13}
const attachmentConfig = defineConfig({
  converters: {
    thumbnail: { // [!code focus:12]
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        resize: 300,
        format: {
          format: 'jpeg',
          options: {
            quality: 80
          }
        }
      }
    }
  }
})
```

## ReSize

Options resize is `number` or `object`(options) details in documentation : [sharp api resize](https://sharp.pixelplumbing.com/api-resize)

Sample:

```typescript{11-16}
import { defineConfig } from '@jrmc/adonis-attachment'
import { InferConverters } from '@jrmc/adonis-attachment/types/config'
import sharp from 'sharp'

const attachmentConfig = defineConfig({
  converters: {
    thumbnail: {
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
    }
  }
})

export default attachmentConfig

declare module '@jrmc/adonis-attachment' {
  interface AttachmentVariants extends InferConverters<typeof attachmentConfig> {}
}
```




