
# Exceptions

|Code                        |Description                                      |  Origin |
| -------------------------- | ----------------------------------------------- | ------- |
| E_MISSING_PACKAGE          | Missing package                                 |         |
| E_CANNOT_CREATE_ATTACHMENT | Unable to create Attachment Object              |         |
| E_ISNOT_BUFFER             | Is not a Buffer                                 |         |
| E_ISNOT_BASE64             | Is not a Base64                                 |         |
| ENOENT                     | Unable to read file                             |         |
| E_CANNOT_WRITE_FILE        | Unable to write file to the destination         | Drive   |
| E_CANNOT_READ_FILE         | Unable to read file                             | Drive   |
| E_CANNOT_DELETE_FILE       | Unable to delete file                           | Drive   |
| E_CANNOT_SET_VISIBILITY    | Unable to set file visibility                   | Drive   |
| E_CANNOT_GENERATE_URL      | Unable to generate URL for a file               | Drive   |
| E_UNALLOWED_CHARACTERS     | The file key has unallowed set of characters    | Drive   |
| E_INVALID_KEY              | Key post normalization leads to an empty string | Drive   |

[Adonis documentation exception](https://docs.adonisjs.com/guides/basics/exception-handling)

## Handling exceptions

If you want to handle a specific exception differently, you can do that inside the `handle` method. Make sure to use the `ctx.response.send` method to send a response, since the return value from the `handle` method is discarded.

::: code-group

```typescript [API]
import { errors } from '@jrmc/adonis-attachment'

export default class HttpExceptionHandler extends ExceptionHandler {
  async handle(error: unknown, ctx: HttpContext) {
    if (error instanceof errors.E_CANNOT_WRITE_FILE) {
      const err = error as errors.E_CANNOT_WRITE_FILE
      ctx.response.status(422).send(err.messages)
      return
    }

    return super.handle(error, ctx)
  }
}
```

```typescript [web]
import { errors } from '@jrmc/adonis-attachment'

export default class HttpExceptionHandler extends ExceptionHandler {
  async handle(error: unknown, ctx: HttpContext) {
    if (error instanceof errors.E_CANNOT_WRITE_FILE) {
      ctx.session.flash('notification', {
        type: 'error',
        message: err.message,
      })

      return ctx.response.redirect('back')
    }

    return super.handle(error, ctx)
  }
}

```

:::
