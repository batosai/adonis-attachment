/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ModelWithAttachment } from '../types/mixin.js'

import {
  persistAttachment,
  commit,
  rollback,
  generateVariants,
  preComputeUrl,
} from '../utils/actions.js'
import {
  clone,
  getAttachmentAttributeNames,
  getDirtyAttachmentAttributeNames,
} from '../utils/helpers.js'
import { defaultStateAttributeMixin } from '../utils/default_values.js'

// @afterFind()
export const afterFindHook = async (modelInstance: ModelWithAttachment) => {
  const attachmentAttributeNames = getAttachmentAttributeNames(modelInstance)

  await Promise.all(
    attachmentAttributeNames.map((attributeName) => {
      return preComputeUrl(modelInstance, attributeName)
    })
  )
}

// @afterFetch()
// @afterPaginate()
export const afterFetchHook = async (modelInstances: ModelWithAttachment[]) => {
  await Promise.all(modelInstances.map((row) => afterFindHook(row)))
}

// @beforeSave()
export const  beforeSaveHook = async (modelInstance: ModelWithAttachment) => {
  const attachmentAttributeNames = getDirtyAttachmentAttributeNames(modelInstance)

  /**
   * Empty previous $attachments
   */
  modelInstance.$attachments = clone(defaultStateAttributeMixin)

  /**
   * Set attributes Attachment type modified
   */
  attachmentAttributeNames.forEach((attributeName) =>
    modelInstance.$attachments.attributesModified.push(attributeName)
  )

  /**
   * Persist attachments before saving the model to the database. This
   * way if file saving fails we will not write anything to the
   * database
   */
  await Promise.all(
    attachmentAttributeNames.map((attributeName) =>
      persistAttachment(modelInstance, attributeName)
    )
  )

  try {
    if (modelInstance.$trx) {
      modelInstance.$trx.after('commit', () => commit(modelInstance))
      modelInstance.$trx.after('rollback', () => rollback(modelInstance))
    } else {
      await commit(modelInstance)
    }
  } catch (error: unknown) {
    await rollback(modelInstance)
    throw error
  }
}

// @afterSave()
export const afterSaveHook = async (modelInstance: ModelWithAttachment) => {
  const attachmentAttributeNames = getAttachmentAttributeNames(modelInstance)

  /**
   * For all properties Attachment
   * Launch async generation variants
   */
  await Promise.all(
    attachmentAttributeNames.map((attributeName) => {
      if (modelInstance.$attachments.attributesModified.includes(attributeName)) {
        return generateVariants(modelInstance, attributeName)
      }
    })
  )
}

// @beforeDelete()
export const beforeDeleteHook = async (modelInstance: ModelWithAttachment) => {
  const attachmentAttributeNames = getAttachmentAttributeNames(modelInstance)

  /**
   * Mark all attachments for deletion
   */
  attachmentAttributeNames.map((attributeName) => {
    if (modelInstance.$attributes[attributeName]) {
      modelInstance.$attachments.detached.push(modelInstance.$attributes[attributeName])
    }
  })

  /**
   * If model is using transaction, then wait for the transaction
   * to settle
   */
  if (modelInstance.$trx) {
    modelInstance.$trx.after('commit', () => commit(modelInstance))
  } else {
    await commit(modelInstance)
  }
}
