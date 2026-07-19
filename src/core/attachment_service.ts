/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import {
  AttachmentFactory,
  type Attachment,
  type CreateAttachmentInput,
} from './attachment.js'
import { markAttachmentPending } from './attachment_state.js'
import type { AttachmentQueue } from './queue.js'
import type { AttachmentStorage } from './storage.js'

export type AttachmentServiceOptions = {
  storage: AttachmentStorage
  queue: AttachmentQueue
  defaultDisk: string
  createId?: () => string
}

/**
 * Creates files and delegates persistence to the configured storage backend.
 * Database persistence deliberately remains the responsibility of the caller.
 */
export class AttachmentService {
  readonly #storage: AttachmentStorage
  readonly #queue: AttachmentQueue
  readonly #factory: AttachmentFactory

  constructor(options: AttachmentServiceOptions) {
    this.#storage = options.storage
    this.#queue = options.queue
    this.#factory = new AttachmentFactory(options)
  }

  async create(input: CreateAttachmentInput): Promise<Attachment> {
    const attachment = this.#factory.create(input)

    await this.#storage.write({
      disk: attachment.disk,
      path: attachment.path,
      body: input.body,
      mimeType: attachment.mimeType,
    })

    markAttachmentPending(attachment)
    return attachment
  }

  remove(attachment: Attachment): Promise<void> {
    return this.#storage.remove(attachment)
  }

  read(attachment: Attachment): Promise<Uint8Array> {
    return this.#storage.read({ disk: attachment.disk, path: attachment.path })
  }

  scheduleVariantGeneration(
    attachment: Attachment,
    variantKeys?: readonly string[]
  ): Promise<void> {
    return this.#queue.enqueue({
      type: 'generate-variants',
      attachmentId: attachment.id,
      ...(variantKeys ? { variantKeys } : {}),
    })
  }
}
