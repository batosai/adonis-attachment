/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentOptions, ModelWithAttachment } from '../types.js'
import { Attachment } from '../../services/attachment_service.js'
import { optionsSym } from './symbols.js'

export function getAttributeAttachments(modelInstance: ModelWithAttachment) {
  return Object.keys(modelInstance.$attributes).filter(
    (attr) => modelInstance.$attributes[attr] instanceof Attachment
  )
}

export function getOptions(modelInstance: ModelWithAttachment, property: string): AttachmentOptions {
  return modelInstance.constructor.prototype[optionsSym]?.[property]
}
