
# Video thumbnail converter

<!--@include: ../partials/install-video.md-->


## Configuration

```typescript
// config/attachment.ts // [!code focus:1]
const attachmentConfig = defineConfig({
  converters: {
    preview: { // [!code focus:3]
      converter: () => import('@jrmc/adonis-attachment/converters/video_thumbnail_converter'),
    }
  }
})
```

By default, image format is `PNG` and size is video size. `options` attribute use ***[image_converter](/guide/converters/image)***

Sample:

```typescript{6-9}
const attachmentConfig = defineConfig({
  converters: {
    preview: { // [!code focus:7]
      converter: () => import('@jrmc/adonis-attachment/converters/video_thumbnail_converter'),
      options: {
        format: 'jpeg',
        resize: 720
      }
    }
  }
})
```
