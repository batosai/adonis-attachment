# Migration v4 -> v5

Remove optionnals packages : node-poppler, libreoffice-file-converter and fluent-ffmpeg.
Adonis-attachment communicates directly with the binaries.

# Config

- Binaries Paths

  If you specify the path to the binaries.

  pdftocairoBasePath -> pdftoppmPath

  libreofficePaths -> sofficePath


- New converter : Autodetect

  Automatic detection by mime type to redirect to other converters (image/pdf/document/video)

```typescript
thumbnail: {
  converter: () => import('@jrmc/adonis-attachment/converters/autodetect_converter'),
  options: {
    resize: 300,
    format: 'webp',
  },
},
```

- The options attribute is now optional

::: code-group
```typescript [Now]
thumbnail: {
  converter: () => import('@jrmc/adonis-attachment/converters/autodetect_converter'),
  resize: 300,
  format: 'webp',
},
```

```typescript [Before]
thumbnail: {
  converter: () => import('@jrmc/adonis-attachment/converters/autodetect_converter'),
  options: {
    resize: 300,
    format: 'webp',
  },
},
```
:::

- Autodetect converter by Default

::: code-group
```typescript [Now]
thumbnail: {
  resize: 300,
  format: 'webp',
},
```

```typescript [Before]
thumbnail: {
  converter: () => import('@jrmc/adonis-attachment/converters/autodetect_converter'),
  options: {
    resize: 300,
    format: 'webp',
  },
},
```
:::