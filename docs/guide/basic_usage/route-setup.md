# Route setup

::: warning
⚠️ [avalable in v5.0.0](/changelog#_5-0-0)
:::

::: info
To prevent conflicts during image generation, the [verrou](https://verrou.dev/docs/introduction) package has been implemented in memory mode. If you use [@adonisjs/lock](https://docs.adonisjs.com/guides/digging-deeper/locks), it will take precedence.
:::

## Basic

Now you can create an route for acces at your uploads. 
If the requested variant does not exist, it will be generated on the fly.

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

:::info Variant
It is possible to generate [variants](/guide/basic_usage/model-setup#specifying-variants) after entity creation to optimize the initial image loading.
:::

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
    route('assets', { key: user.avatar.getKeyId(), name: 'image-name.jpg' }, { qs: { 
      variant: 'thumbnail'
    }}) 
  }}"
  loading="lazy"
  alt=""
/>
```
:::