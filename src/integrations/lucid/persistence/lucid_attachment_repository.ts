/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../../../core/attachment.js'
import type { AttachmentRepository } from '../../../core/attachment_repository.js'
import { AttachmentModel } from '../models/attachment_model.js'

/**
 * Attachment repository used by workers when attachments are persisted by Lucid.
 */
export class LucidAttachmentRepository implements AttachmentRepository {
  readonly #model: typeof AttachmentModel

  constructor(model: typeof AttachmentModel = AttachmentModel) {
    this.#model = model
  }

  async findById(id: string): Promise<Attachment | null> {
    const row = await this.#model.find(id)

    return row?.toAttachment() ?? null
  }
}
