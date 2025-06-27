# Route setup

## Basic

Now you can create an route for acces at your uploads. 
If the requested variant does not exist, it will be generated on the fly.

⚠️ [avalable in v5.0.0](/changelog#_5-0-0)


```ts
// start/routes.ts
import router from '@adonisjs/core/services/router'

router.attachments() // [!code highlight]
```

## Custom pattern

```ts
// start/routes.ts
import router from '@adonisjs/core/services/router'

router.attachments('/assets/:key/*') // [!code highlight]

// default is '/attachments/:key/:name?'
```

## Identifier

```ts
// start/routes.ts
import router from '@adonisjs/core/services/router'

router.attachments('/assets/:key/:name?').as('assets') // [!code highlight]
```

## Query string options

- **variant** : variant name

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
    route('assets', { key: user.avatar.keyId, name: 'image-name.jpg' }, { qs: { 
      variant: 'thumbnail'
    }}) 
  }}"
  loading="lazy"
  alt=""
/>
```
:::
