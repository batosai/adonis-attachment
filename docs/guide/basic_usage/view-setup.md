# View setup

Now all you have to do is display your images in your view.

## Use assets [routes](/guide/basic_usage/route-setup)

⚠️ [avalable in v5.0.0](/changelog#_5-0-0)

::: code-group
```sh [edge]
<img src="/assets/{{ user.avatar.getKeyId() }}" loading="lazy" alt="" />

<img 
  src="{{ 
    route('assets', `${user.avatar.getkeyId()}/image-name.webp`, { qs: { 
      variant: 'thumbnail'
    }}) 
  }}/image-name.jpg"
  loading="lazy"
  alt=""
/>
```
```sh [Tuyau]

```
:::


## URLs for edge template

```ts
await user.avatar.getUrl()
await user.avatar.getUrl('thumbnail')
// or await user.avatar.getVariant('thumbnail').getUrl()

await user.avatar.getSignedUrl()
await user.avatar.getSignedUrl('thumbnail')
// or await user.avatar.getVariant('thumbnail').getSignedUrl()
```

```edge
<img src="{{ await user.avatar.getUrl('thumbnail') }}" loading="lazy" alt="" />

<img src="{{ await user.avatar.getSignedUrl() }}" loading="lazy" alt="" />
<img src="{{ await user.avatar.getSignedUrl({
  expiresIn: '30 mins',
}) }}" loading="lazy" alt="" />

<img src="{{ await user.avatar.getSignedUrl('thumbnail') }}" loading="lazy" alt="" />
<img src="{{ await user.avatar.getSignedUrl('thumbnail', {
  expiresIn: '30 mins',
}) }}" loading="lazy" alt="" />
```

getSignedUrl options params accepts `expiresIn`, `contentType` et `contentDisposition`. [More informations](https://flydrive.dev/docs/disk_api#getsignedurl)

### If preComputeUrl is enabled

```edge
<img src="{{ user.avatar.url }}" loading="lazy" alt="" />
<img src="{{ user.avatar.getVariant('thumbnail').url }}" loading="lazy" alt="" />
```


## URLs for Inertia template

::: code-group
```js [react]
<img src={user.avatar.thumbnail.url} loading="lazy" alt="" />
```

```vue
<img :src="user.avatar.thumbnail.url" loading="lazy" alt="" />
```

```svelte
<img src={user.avatar.thumbnail.url} loading="lazy" alt="" />
```
:::

preComputeUrl is required.

### With [Tuyau](https://tuyau.julr.dev)
