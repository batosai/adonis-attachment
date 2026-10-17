/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../../../core/attachment.js'
import { validateAttachmentReference } from '../../../core/attachment_reference.js'
import { AttachmentValidationError } from '../../../errors.js'

/** Never send another adapter's locator to a bare-ID table write. */
export function assertTableAttachmentReference(attachment: Attachment): void {
  if (attachment.reference === undefined) return
  const reference = validateAttachmentReference(attachment.id, attachment.reference)
  if (reference.adapter !== 'tables' || reference.owner !== undefined) {
    throw new AttachmentValidationError('The Lucid tables adapter cannot consume this attachment reference')
  }
}
