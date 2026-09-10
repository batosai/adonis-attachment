/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { AttachmentLifecycleService, type AttachmentFileService } from '../../../core/attachment_lifecycle_service.js'
import type { AttachmentPersistence } from '../../../core/attachment_persistence.js'
import type { AttachmentLinkModel } from '../models/attachment_link_model.js'
import type { AttachmentModel } from '../models/attachment_model.js'

export { AttachmentFileCleanupError, type AttachmentFileService } from '../../../core/attachment_lifecycle_service.js'

/** Compatibility alias retaining the model-specific results of the tables adapter. */
export type LucidAttachmentPersistence = AttachmentPersistence<AttachmentLinkModel, AttachmentModel>

/** Existing Lucid API; the lifecycle implementation is shared with future adapters. */
export class LucidAttachmentLifecycleService extends AttachmentLifecycleService<AttachmentLinkModel, AttachmentModel> {
  protected override createScopedService(attachments: AttachmentFileService, store: LucidAttachmentPersistence): LucidAttachmentLifecycleService {
    return new LucidAttachmentLifecycleService(attachments, store)
  }
}
