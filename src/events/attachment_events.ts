/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../core/attachment.js'

export type AttachmentEventName =
  | 'attachment:created'
  | 'attachment:deleted'
  | 'attachment:metadata_started'
  | 'attachment:metadata_completed'
  | 'attachment:metadata_failed'
  | 'attachment:variant_started'
  | 'attachment:variant_completed'
  | 'attachment:variant_failed'

/**
 * Identifies a Lucid relation using the v5 event payload fields. It remains
 * optional because the core can also run without any database integration.
 */
export type AttachmentEventContext = {
  tableName: string
  attributeName: string
  primary: {
    key: string
    value: string | number
  }
}

export type AttachmentEventFailure = {
  message: string
  code?: string
}

/**
 * Payload shared by attachment lifecycle events. `tableName`, `attributeName`
 * and `primary` retain the v5 contract for attachments managed by Lucid.
 */
export type AttachmentEventPayload = Partial<AttachmentEventContext> & {
  attachment: Attachment
  variants?: readonly string[]
  error?: AttachmentEventFailure
}

export interface AttachmentEventEmitter {
  emit(event: AttachmentEventName, payload: AttachmentEventPayload): void | Promise<void>
}

/**
 * Dispatches observers without allowing their failures to alter attachment
 * persistence or queue processing.
 */
export function emitAttachmentEvent(
  emitter: AttachmentEventEmitter | undefined,
  event: AttachmentEventName,
  payload: AttachmentEventPayload
): void {
  if (!emitter) {
    return
  }

  try {
    void Promise.resolve(emitter.emit(event, payload)).catch(() => undefined)
  } catch {
    // Event listeners are observational and must never fail the attachment operation.
  }
}

export function toAttachmentEventFailure(error: unknown): AttachmentEventFailure {
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; code?: unknown }
    return {
      message: typeof value.message === 'string' ? value.message : String(error),
      ...(typeof value.code === 'string' ? { code: value.code } : {}),
    }
  }

  return { message: String(error) }
}
