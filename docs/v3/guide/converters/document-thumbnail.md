
# Document thumbnail converter

⚠️ [avalable in v2.3.0](/changelog#_2-3-0)

<!--@include: ../partials/install-document.md-->

## Configuration

```typescript
// config/attachment.ts // [!code focus:1]
const attachmentConfig = defineConfig({
  converters: {
    preview: { // [!code focus:3]
      converter: () => import('@jrmc/adonis-attachment/converters/document_thumbnail_converter'),
    }
  }
})
```

By default, image format is `JPEG` and size is video size. `options` attribute use ***[image_converter](/guide/converters/image)***

Sample:

```typescript{6-9}
const attachmentConfig = defineConfig({
  converters: {
    preview: { // [!code focus:7]
      converter: () => import('@jrmc/adonis-attachment/converters/document_thumbnail_converter'),
      options: {
        format: 'webp',
        resize: 720
      }
    }
  }
})
```
