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
  converters: {
    small: {
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      resize: 480,
      format: 'jpeg',
    },
    medium: {
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      resize: 768,
      format: 'jpeg',
    },
    large: {
      converter: () => import('@jrmc/adonis-attachment/converters/image_converter'),
      resize: 1200,
      format: 'jpeg',
    }
  }
})
```
```ts [app/models/article.ts]
import { BaseModel } from '@adonisjs/lucid/orm'
import { attachment } from '@jrmc/adonis-attachment'
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment'

class Article extends BaseModel { 
  @attachment({
    variants: ['small', 'medium', 'large'] 
  }) 
  declare image: Attachment
}
```
```ts [app/controllers/article_controller.ts]
import type { HttpContext } from '@adonisjs/core/http'

export default class ArticleController { 
  async index({ view }: HttpContext) {
    const articles = await Article.all()

    return view.render('pages/articles/index', {
      articles // for edge
      articles: (await articles?.serialize()) // for react, vue, svelte
    })
  }
}
```

:::
