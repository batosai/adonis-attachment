# Autodetect converter

The autodetect converter analyzes the mime type and determines which converter to use among image_converter, pdf_thumbnail_converter, document_thumbnail_converter, and video_thumbnail_converter.

autodetect_converter is **default value**

## Configuration

```typescript
// config/attachment.ts
const attachmentConfig = defineConfig({
  converters: {
    large: { // [!code focus:5]
      // => optional
      // converter: () => import('@jrmc/adonis-attachment/converters/autodetect_converter'),
      resize: 1280,
    }
  }
})
```