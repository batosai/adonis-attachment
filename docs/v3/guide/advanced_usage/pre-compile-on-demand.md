# Pre compute on demand

We recommend not enabling the preComputeUrl option when you need the URL for just one or two queries and not within the rest of your application.

For those couple of queries, you can manually compute the URLs within the controller. Here's a small helper method that you can drop on the model directly.

```ts
import type { Attachment } from '@jrmc/adonis-attachment/types/attachment'
import { attachment, Attachmentable, attachmentManager } from '@jrmc/adonis-attachment'

class User extends compose(BaseModel, Attachmentable) {
  static async preComputeUrls(models: User | User[]) {
    if (Array.isArray(models)) {
      await Promise.all(models.map((model) => this.preComputeUrls(model)))
      return
    }

    // compute url for original file
    await attachmentManager.computeUrl(models.avatar)

    // compute url for thumbnail variant
    const thumb = models.avatar.getVariant('thumbnail')
    await attachmentManager.computeUrl(thumb)

    // compute url for medium variant with expiration time option
    const medium = models.avatar.getVariant('medium')
    await attachmentManager.computeUrl(medium, {
      expiresIn: '30 mins',
    })
  }

  @attachment({
    variants: ['thumbnail', 'medium', 'large']
  })
  declare avatar: Attachment
}
```

computeUrl method create automatically creates a signed or unsigned url depending on Drive's configuration.

it's possible to pass specific options to the signed url.
options params accepts `expiresIn`, `contentType` et `contentDisposition`.

[More informations](https://flydrive.dev/docs/disk_api#getsignedurl)

---

And now use it as follows.

```ts
const users = await User.all()
await User.preComputeUrls(users)

return users
```

Or for a single user

```ts
const user = await User.findOrFail(1)
await User.preComputeUrls(user)

return user
```
