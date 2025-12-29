# View setup

Now all you have to do is display your images in your view.

## Use attachments [routes](/guide/basic_usage/route-setup)

⚠️ [avalable in v5.0.0](/changelog#_5-0-0)

::: code-group
```sh [edge]
<img src="/attachments/{{ user.avatar.getKeyId() }}" loading="lazy" alt="" />

// by route
<img 
  src="{{ route('attachments', { key: user.avatar.getkeyId(), name: 'image-name.jpg' }) }}"
  loading="lazy"
  alt=""
/>
```
```sh [Tuyau]
<img
  :src="tuyau.$url('attachments', { params: { key: user.avatar.getKeyId(), name: 'image-name.jpg' }})"
  loading="lazy"
  alt=""
/>
```
:::


## URLs for edge template

(preComputeUrl is not necessary)

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

## PreComputeUrl is enabled

Please check the [preComputeUrl](/guide/basic_usage/model-setup#specifying-precomputeurl) option for enabled or [global config](/guide/essentials/configuration#precomputeurl-optional-default-false)

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

preComputeUrl is required in [model](/guide/basic_usage/model-setup#specifying-precomputeurl) or [global config](/guide/essentials/configuration#precomputeurl-optional-default-false)

### With [Tuyau](https://tuyau.julr.dev)

::: code-group
```js [react]
<img
  src={tuyau.$url('attachments', { params: { key: user.avatar.getKeyId(), name: 'image.jpg' }, query: { variant: 'thumbnail'} })}
  loading="lazy"
  alt=""
/>
```

```vue
<img
  :src="tuyau.$url('attachments', { params: { key: user.avatar.getKeyId(), name: 'image.jpg' }, query: { variant: 'thumbnail'} })"
  loading="lazy"
  alt=""
/>
```

```svelte
<img
  src={tuyau.$url('attachments', { params: { key: user.avatar.getKeyId(), name: 'image.jpg' }, query: { variant: 'thumbnail'} })}
  loading="lazy"
  alt=""
/>
```
:::
