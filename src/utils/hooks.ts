/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { RowWithAttachment } from '../types/mixin.js'
import AttachmentRecordService from '../services/attachment_service.js'

const pendingVariants = new WeakMap<object, Map<RowWithAttachment, Set<string>>>()

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
  if (modelInstance.$trx) await model.transaction()
  await model.detach()
  await model.persist()
}

// @afterSave()
export const afterSaveHook = async (instance: unknown) => {
  const modelInstance = instance as RowWithAttachment
  const model = new AttachmentRecordService(modelInstance)
  await model.transaction()
  if (modelInstance.$trx) {
    const trx = modelInstance.$trx
    let rows = pendingVariants.get(trx)
    if (!rows) {
      rows = new Map()
      pendingVariants.set(trx, rows)
      const pending = rows
      trx.after('commit', async () => {
        pendingVariants.delete(trx)
        for (const [row, names] of pending) {
          if (!row.$isDeleted && names.size) {
            await new AttachmentRecordService(row).regenerateVariants({ attributes: [...names] })
          }
        }
      })
      trx.after('rollback', () => {
        pendingVariants.delete(trx)
      })
    }
    const names = rows.get(modelInstance) ?? new Set<string>()
    for (const name of modelInstance.$attachments.dirtied) names.add(name)
    rows.set(modelInstance, names)
  } else {
    await model.generateVariants()
  }
  await model.setKeyId()
}

// @beforeDelete()
export const beforeDeleteHook = async (instance: unknown) => {
  const modelInstance = instance as RowWithAttachment
  const model = new AttachmentRecordService(modelInstance)
  if (modelInstance.$trx) await model.transaction()
  await model.detachAll()
}

export const afterDeleteHook = async (instance: unknown) => {
  await new AttachmentRecordService(instance as RowWithAttachment).transaction()
}
