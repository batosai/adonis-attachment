
# Video thumbnail converter

```typescript
export default defineConfig({
  converters: [
    { // [!code focus:4]
      key: 'preview',
      converter: () => import('@jrmc/adonis-attachment/converters/video_thumbnail_converter'),
    }
  ]
})
```

By default, image format is `PNG` and size is video size. `options` attribute use ***image_converter***

Sample:

```typescript{6-9}
export default defineConfig({
  converters: [
    { // [!code focus:8]
      key: 'preview',
      converter: () => import('@jrmc/adonis-attachment/converters/video_thumbnail_converter'),
      options: {
        format: 'jpeg',
        resize: 720
      }
    }
  ]
})
```
