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
  :src="tuyau.$url('attachments', { params: { key: user.avatar.keyId, name: 'image-name.jpg' }})"
  loading="lazy"
  alt=""
/>
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

::: code-group
```js [react]
<img
  src={tuyau.$url('attachments', { params: { key: user.avatar.keyId, name: 'image.jpg' }, query: { variant: 'thumbnail'} })}
  loading="lazy"
  alt=""
/>
```

```vue
<img
  :src="tuyau.$url('attachments', { params: { key: user.avatar.keyId, name: 'image.jpg' }, query: { variant: 'thumbnail'} })"
  loading="lazy"
  alt=""
/>
```

```svelte
<img
  src={tuyau.$url('attachments', { params: { key: user.avatar.keyId, name: 'image.jpg' }, query: { variant: 'thumbnail'} })}
  loading="lazy"
  alt=""
/>
```
:::