import emitter from '@adonisjs/core/services/emitter'
import type { AttachmentEventName, AttachmentEventPayload } from '@jrmc/adonis-attachment'

const events: AttachmentEventName[] = [
  'attachment:created', 'attachment:deleted',
  'attachment:metadata_started', 'attachment:metadata_completed', 'attachment:metadata_failed',
  'attachment:variant_started', 'attachment:variant_completed', 'attachment:variant_failed',
]
for (const event of events) {
  emitter.on(event, (payload) => {
    const typed: AttachmentEventPayload = payload
    const id: string = payload.attachment.id
    void [typed, id]
  })
}
// @ts-expect-error Event payloads require an attachment.
emitter.emit('attachment:created', {})
// @ts-expect-error Unregistered event names remain invalid.
emitter.on('attachment:unknown', () => {})
