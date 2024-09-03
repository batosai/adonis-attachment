
# Document thumbnail converter

<!--@include: ../partials/install-document.md-->

## Configuration

```typescript
// config/attachment.ts // [!code focus:1]
export default defineConfig({
  converters: [
    { // [!code focus:4]
      key: 'preview',
      converter: () => import('@jrmc/adonis-attachment/converters/document_thumbnail_converter'),
    }
  ]
})
```

By default, image format is `JPEG` and size is video size. `options` attribute use ***[image_converter](/guide/converters/image)***

Sample:

```typescript{6-9}
export default defineConfig({
  converters: [
    { // [!code focus:8]
      key: 'preview',
      converter: () => import('@jrmc/adonis-attachment/converters/document_thumbnail_converter'),
      options: {
        format: 'webp',
        resize: 720
      }
    }
  ]
})
```
