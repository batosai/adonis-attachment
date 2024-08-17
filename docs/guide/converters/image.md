# Image converter

```typescript
export default defineConfig({
  converters: [
    { // [!code focus:7]
      key: 'large',
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'), 
      options: {
        resize: 1280,
      }
    }
  ]
})
```

## Format

The default format is `webp`, for change, use options format: 

```typescript
export default defineConfig({
  converters: [
    { // [!code focus:8]
      key: 'thumbnail',
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        resize: 300,
        format: 'jpeg', // [!code highlight]
      }
    }
  ]
})
```

Options format is `string` or `object` [ format,  options ] details in documentation : [sharp api outpout](https://sharp.pixelplumbing.com/api-output#toformat)


Sample for personalize image quality: 

```typescript{8-13}
export default defineConfig({
  converters: [
    { // [!code focus:13]
      key: 'thumbnail',
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
  ]
})
```

## ReSize

Options resize is `number` or `object`(options) details in documentation : [sharp api resize](https://sharp.pixelplumbing.com/api-resize)

Sample:

```typescript{11-16}
import { defineConfig } from '@jrmc/adonis-attachment'
import sharp from 'sharp'

export default defineConfig({
  converters: [
    {
      key: 'thumbnail',
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
  ]
})
```




