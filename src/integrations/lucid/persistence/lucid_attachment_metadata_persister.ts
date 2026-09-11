/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../../../core/attachment.js'
import type { AttachmentMetadataPersister } from '../../../core/attachment_metadata_persister.js'
import type { AttachmentMetadata } from '../../../media/media_metadata.js'
import { AttachmentModel } from '../models/attachment_model.js'
import { assertTableAttachmentReference } from './assert_table_attachment_reference.js'

/** Updates metadata for an attachment blob persisted in the Lucid attachments table. */
export class LucidAttachmentMetadataPersister implements AttachmentMetadataPersister {
  readonly #model: typeof AttachmentModel

  constructor(model: typeof AttachmentModel = AttachmentModel) {
    this.#model = model
  }

  async persistMetadata(attachment: Attachment, metadata: AttachmentMetadata): Promise<void> {
    assertTableAttachmentReference(attachment)
    // Query-builder updates bypass the model column's prepare hook. Bind JSON text
    // explicitly for drivers that cannot encode a JavaScript object themselves.
    await this.#model.query().where('id', attachment.id).update({ metadata: JSON.stringify(metadata) })
  }
}
