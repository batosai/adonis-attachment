# Picture

Using your variants with `<picture>` for create a component.

::: code-group

```js [edge]
// picture.edge
<picture>
  <source media="(min-width: 1200px)" srcset="{{ await source.getUrl('large') }}">
  <source media="(min-width: 768px)" srcset="{{ await source.getUrl('medium') }}">
  <source media="(min-width: 480px)" srcset="{{ await source.getUrl('small') }}">
  <img src="{{ await source.getUrl() }}" alt="image description">
</picture>
```
```js [react]
// picture.jsx
import React from 'react';

const Picture = ({ source, alt }) => {
  return (
    <picture>
      <source media="(min-width: 1200px)" srcSet={source.large.url} />
      <source media="(min-width: 768px)" srcSet={source.medium.url} />
      <source media="(min-width: 480px)" srcSet={source.small.url} />
      <img src={source.url} alt={alt} />
    </picture>
  )
}
```
```svelte [vue]
// picture.vue
<template>
  <picture>
    <source media="(min-width: 1200px)" :srcset="source.large.url">
    <source media="(min-width: 768px)" :srcset="source.medium.url">
    <source media="(min-width: 480px)" :srcset="source.small.url">
    <img :src="source.url" :alt="alt">
  </picture>
<template>

<script setup>
  defineProps({
    source: Object,
    alt: String
  })
</script>
```
```svelte
// picture.svelte
<script>
  export let source;
  export let alt;
</script>

<picture>
  <source media="(min-width: 1200px)" srcset={source.large.url}>
  <source media="(min-width: 768px)" srcset={source.medium.url}>
  <source media="(min-width: 480px)" srcset={source.small.url}>
  <img src={source.url} alt={alt}>
</picture>
```
:::

Use

::: code-group

```edge [edge]
@!picture({
  source: article.image,
  alt: "Image alt"
})
```
```js [react]
<Picture 
  source={ article.image } 
  alt="Image alt" 
/>
```
```svelte [vue]
<Picture 
  :source="article.image" 
  alt="Image alt" 
/>
```
```svelte
<Picture 
  source={ article.image } 
  alt="Image alt" 
/>
```
:::


Configuration

::: code-group

```ts [config/attachment.ts]
import { defineConfig } from '@jrmc/adonis-attachment'

export default defineConfig({
  preComputeUrl: true,
  converters: [
    small: {
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        resize: 480,
      }
    },
    medium: {
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        resize: 768,
      }
    },
    large: {
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      options: {
        resize: 1200,
      }
    }
  ]
})
```
```ts [app/models/article.ts]
import { BaseModel } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { attachment, Attachmentable } from '@jrmc/adonis-attachment'
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment'

class User extends compose(BaseModel, Attachmentable) { 
  @attachment({
    variants: ['small', 'medium', 'large'] 
  }) 
  declare image: Attachment
}
```

:::
