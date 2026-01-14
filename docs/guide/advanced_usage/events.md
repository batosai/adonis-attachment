# Events

::: warning
⚠️ [new in v5.1.0](/changelog#_5-1-0)
:::

Adonis Attachment emits events via the AdonisJS emitter during the variant generation lifecycle. These events allow you to track progress, handle errors, and build features like notifications or progress indicators.

## Available Events

| Event | Description |
|-------|-------------|
| `attachment:variant_started` | Emitted when variant generation begins |
| `attachment:variant_completed` | Emitted when variant generation completes successfully |
| `attachment:variant_failed` | Emitted when variant generation fails |

## Event Payload

All events share the same payload structure:

```ts
type AttachmentEventPayload = {
  tableName: string          // Database table name (e.g., 'users')
  attributeName: string      // Model attribute name (e.g., 'avatar')
  primary: {
    key: string              // Primary key column name (e.g., 'id')
    value: string | number   // Primary key value
  }
  variants?: string[]        // List of variant names being processed
}
```

## Listening to Events

Create a preload file to listen to attachment events:

```sh
node ace make:preload attachment
```

```ts
// start/attachment.ts
import emitter from '@adonisjs/core/services/emitter'
import type { AttachmentEventPayload } from '@jrmc/adonis-attachment/types/event'

emitter.on('attachment:variant_started', (payload: AttachmentEventPayload) => {
  console.log(`Started generating variants for ${payload.tableName}.${payload.attributeName}`)
  console.log(`Record ID: ${payload.primary.value}`)
  console.log(`Variants: ${payload.variants?.join(', ')}`)
})

emitter.on('attachment:variant_completed', (payload: AttachmentEventPayload) => {
  console.log(`Completed generating variants for ${payload.tableName}.${payload.attributeName}`)
})

emitter.on('attachment:variant_failed', (payload: AttachmentEventPayload) => {
  console.error(`Failed to generate variants for ${payload.tableName}.${payload.attributeName}`)
  console.error(`Record ID: ${payload.primary.value}`)
})
```

## Use Cases

### Progress Notifications

You can use these events to notify users when their uploads are processed:

```ts
import emitter from '@adonisjs/core/services/emitter'
import type { AttachmentEventPayload } from '@jrmc/adonis-attachment/types/event'

emitter.on('attachment:variant_completed', async (payload: AttachmentEventPayload) => {
  // Send notification to user via WebSocket, email, etc.
  await notifyUser(payload.primary.value, 'Your file has been processed!')
})
```

### Error Monitoring

Track failed variant generations for monitoring:

```ts
import emitter from '@adonisjs/core/services/emitter'
import logger from '@adonisjs/core/services/logger'
import type { AttachmentEventPayload } from '@jrmc/adonis-attachment/types/event'

emitter.on('attachment:variant_failed', (payload: AttachmentEventPayload) => {
  logger.error({
    table: payload.tableName,
    attribute: payload.attributeName,
    recordId: payload.primary.value,
    variants: payload.variants,
  }, 'Variant generation failed')
})
```

::: tip
These events are different from the [queue events](/guide/advanced_usage/queue#events). Queue events are for tracking the internal task queue, while these events provide higher-level information about the attachment lifecycle.
:::
