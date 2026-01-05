/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { RowWithAttachment } from '../types/mixin.js'
import AttachmentRecordService from '../services/attachment_service.js'

// @afterFind()
export const afterFindHook = async (instance: unknown) => {
  const modelInstance = instance as RowWithAttachment
  const model = new AttachmentRecordService(modelInstance)
  await model.setKeyId()
  await model.preComputeUrl()
}

// @afterFetch()
// @afterPaginate()
export const afterFetchHook = async (instance: unknown) => {
  const modelInstances = instance as RowWithAttachment[]
  await Promise.all(modelInstances.map((row) => afterFindHook(row)))
}

// @beforeSave()
export const beforeSaveHook = async (instance: unknown) => {
  const modelInstance = instance as RowWithAttachment
  const model = new AttachmentRecordService(modelInstance)
  await model.detach()
  await model.persist()
  await model.transaction()
}

// @afterSave()
export const afterSaveHook = async (instance: unknown) => {
  const modelInstance = instance as RowWithAttachment
  const model = new AttachmentRecordService(modelInstance)
  await model.generateVariants()
  await model.setKeyId()
}

// @beforeDelete()
export const beforeDeleteHook = async (instance: unknown) => {
  const modelInstance = instance as RowWithAttachment
  const model = new AttachmentRecordService(modelInstance)
  await model.detachAll()
  await model.transaction({ enabledRollback: false })
}
