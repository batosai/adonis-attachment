/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { RowWithAttachment } from '../../types/mixin.js'
import type { Attachment as AttachmentType, LucidOptions } from '../../types/attachment.js'
import { Attachment } from '../../attachments/attachment.js'
import { optionsSym } from '../../utils/symbols.js'

export class AttachmentUtils {
  /**
   * Get attachments by attribute name, handling both single and array values
   */
  static getAttachmentsByAttributeName(row: RowWithAttachment, name: string): AttachmentType[] {
    if (Array.isArray(row.$attributes[name])) {
      return row.$attributes[name] as AttachmentType[]
    }
    return [row.$attributes[name] as AttachmentType]
  }

  /**
   * Get original attachments by attribute name, handling both single and array values
   */
  static getOriginalAttachmentsByAttributeName(
    row: RowWithAttachment,
    name: string
  ): AttachmentType[] {
    if (Array.isArray(row.$original[name])) {
      return row.$original[name] as AttachmentType[]
    }
    return [row.$original[name] as AttachmentType]
  }

  /**
   * Get dirty attachments by attribute name, handling both single and array values
   */
  static getDirtyAttachmentsByAttributeName(
    row: RowWithAttachment,
    name: string
  ): AttachmentType[] {
    if (Array.isArray(row.$dirty[name])) {
      return row.$dirty[name] as AttachmentType[]
    }
    return [row.$dirty[name] as AttachmentType]
  }

  /**
   * Get options by attribute name from the model prototype
   */
  static getOptionsByAttributeName(row: RowWithAttachment, name: string): LucidOptions {
    return row.constructor.prototype[optionsSym]?.[name]
  }

  /**
   * Get all attribute names that contain attachments
   */
  static getAttributeNamesOfAttachment(row: RowWithAttachment): string[] {
    return Object.keys(row.$attributes).filter((name) => {
      const value = row.$attributes[name]
      return (
        value instanceof Attachment ||
        (Array.isArray(value) && value.every((item) => item instanceof Attachment))
      )
    })
  }

  /**
   * Get dirty attribute names that contain attachments
   */
  static getDirtyAttributeNamesOfAttachment(row: RowWithAttachment): string[] {
    return Object.keys(row.$dirty).filter((name) => {
      const dirtyValue = row.$dirty[name]
      const originalValue = row.$original[name] // if dirtyValue is null, check original type

      const isDirtyAttachment =
        dirtyValue instanceof Attachment ||
        (Array.isArray(dirtyValue) &&
          dirtyValue.length &&
          dirtyValue.every((item) => item instanceof Attachment))

      const isOriginalAttachment =
        originalValue instanceof Attachment ||
        (Array.isArray(originalValue) &&
          originalValue.length &&
          originalValue.every((item) => item instanceof Attachment))

      return isDirtyAttachment || isOriginalAttachment
    })
  }
}
