# View setup

Now all you have to do is display your images in your view.

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


## By serialize

```ts
await user.avatar.toJSON()
```

```vue
<img :src="user.avatar.thumbnail.url" loading="lazy" alt="" />
<img :src="user.avatar.thumbnail.signedUrl" loading="lazy" alt="" />
```

