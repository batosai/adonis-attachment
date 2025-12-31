# Picture

Using your variants with `<picture>` for create a component.

::: code-group

```js [edge]
// picture.edge
<picture>
  <source media="(min-width: 1200px)" srcset="{{ 
    route('attachments', { key: article.image.getKeyId(), name: 'image-name.jpg' }, { qs: {
      variant: 'large'
    }})
  }}/image-name.jpg">
  <source media="(min-width: 768px)" srcset="{{ 
    route('attachments', { key: article.image.getKeyId(), name: 'image-name.jpg' }, { qs: { 
      variant: 'medium'
    }})
  }}/image-name.jpg">
  <source media="(min-width: 480px)" srcset="{{ 
    route('attachments', { key: article.image.getKeyId(), name: 'image-name.jpg' }, { qs: { 
      variant: 'small'
    }})
  }}/image-name.jpg">
  <img src="{{ 
    route('attachments', { key: article.image.getKeyId(), name: 'image-name.jpg' })
  }}/image-name.jpg" alt="image description">
</picture>
```
```js [react]
// picture.jsx
import React from 'react';

const Picture = ({ source, alt }) => {
  return (
    <picture>
      <source media="(min-width: 1200px)" srcSet="`/attachments/${article.image.keyId}/image-name.jpg?variant=large`" />
      <source media="(min-width: 768px)" srcSet="`/attachments/${article.image.keyId}/image-name.jpg?variant=medium`" />
      <source media="(min-width: 480px)" srcSet="`/attachments/${article.image.keyId}/image-name.jpg?variant=small`" />
      <img src="`/attachments/${article.image.keyId}/image-name.jpg`" alt={alt} />
    </picture>
  )
}
```
```svelte [vue]
// picture.vue
<template>
  <picture>
    <source media="(min-width: 1200px)" srcset="`/attachments/${article.image.keyId}/image-name.jpg?variant=large`">
    <source media="(min-width: 768px)" srcset="`/attachments/${article.image.keyId}/image-name.jpg?variant=medium`">
    <source media="(min-width: 480px)" srcset="`/attachments/${article.image.keyId}/image-name.jpg?variant=small`">
    <img src="`/attachments/${article.image.keyId}/image-name.jpg`" :alt="alt">
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
  <source media="(min-width: 1200px)" srcset="`/attachments/${article.image.keyId}/image-name.jpg?variant=large`">
  <source media="(min-width: 768px)" srcset="`/attachments/${article.image.keyId}/image-name.jpg?variant=medium`">
  <source media="(min-width: 480px)" srcset="`/attachments/${article.image.keyId}/image-name.jpg?variant=small`">
  <img src="`/attachments/${article.image.keyId}/image-name.jpg`" alt={alt}>
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
  converters: {
    small: { resize: 480, format: 'jpeg', },
    medium: { resize: 768, format: 'jpeg', },
    large: { resize: 1200, format: 'jpeg', }
  }
})
```
```ts [app/models/article.ts]
import { BaseModel } from '@adonisjs/lucid/orm'
import { attachment } from '@jrmc/adonis-attachment'
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment'

class Article extends BaseModel { 
  @attachment() 
  declare image: Attachment
}
```
```ts [app/controllers/article_controller.ts]
import type { HttpContext } from '@adonisjs/core/http'

export default class ArticleController { 
  async index({ view }: HttpContext) {
    const articles = await Article.all()

    return view.render('pages/articles/index', {
      articles: (await articles?.serialize())
    })
  }
}
```

```ts [start/routes.ts]
import router from '@adonisjs/core/services/router'

router.attachments()
```

:::
