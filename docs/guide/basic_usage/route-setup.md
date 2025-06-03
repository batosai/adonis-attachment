# Route setup

## Basic

Now you can create an route for acces at your uploads. 
If the requested variant does not exist, it will be generated on the fly.

⚠️ [avalable in v5.0.0](/changelog#_5-0-0)


```ts
// start/routes.ts
import router from '@adonisjs/core/services/router'
const AssetsController = () => import('@jrmc/adonis-attachment/controllers/assets_controller') // [!code highlight]

router.get('/assets/:key', [AssetsController]).as('assets') // [!code highlight]
```

## For SEO

```ts
// start/routes.ts
import router from '@adonisjs/core/services/router'
const AssetsController = () => import('@jrmc/adonis-attachment/controllers/assets_controller') // [!code highlight]

router.get('/assets/:key/*', [AssetsController]) // [!code highlight]
```

## Example

::: code-group

```ts [controller]
class UsersController {
  public show({ request, view }: HttpContext) {
    const user = User.first()

    return view.render('user/show', {
      user: await user.serialize()
    })
  }
}
```

```edge
// edge example
<img 
  src="{{ 
    route('assets', `${user.avatar.keyId}/image-name.webp`, { qs: { 
      variant: 'thumbnail'
    }}) 
  }}/image-name.jpg"
  loading="lazy"
  alt=""
/>
```
:::
