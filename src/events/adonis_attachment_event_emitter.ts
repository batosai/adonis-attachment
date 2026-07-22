/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type {
  AttachmentEventEmitter,
  AttachmentEventName,
  AttachmentEventPayload,
} from './attachment_events.js'

export type AdonisEmitter = {
  emit(event: string, payload: unknown): void | Promise<void>
}

/** Adapts AdonisJS' emitter to the attachment event contract. */
export class AdonisAttachmentEventEmitter implements AttachmentEventEmitter {
  readonly #emitter: AdonisEmitter

  constructor(emitter: AdonisEmitter) {
    this.#emitter = emitter
  }

  emit(event: AttachmentEventName, payload: AttachmentEventPayload): void | Promise<void> {
    return this.#emitter.emit(event, payload)
  }
}
