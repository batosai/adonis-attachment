/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../types/attachment.js'
import type { ModelWithAttachment } from '../types/mixin.js'

import logger from '@adonisjs/core/services/logger'
import attachmentManager from '../../services/main.js'
import { getOptions } from './helpers.js'
import { ConverterManager } from '../converter_manager.js'
import { E_CANNOT_CREATE_VARIANT } from '../errors.js'

/**
 * During commit, we should cleanup the old detached files
 */
export async function commit(modelInstance: ModelWithAttachment): Promise<void> {
  await Promise.allSettled(
    modelInstance.$attachments.detached.map((attachment: Attachment) =>
      attachmentManager.delete(attachment)
    )
  )
}

/**
 * During rollback we should remove the attached files.
 */
export async function rollback(modelInstance: ModelWithAttachment) {
  await Promise.allSettled(
    modelInstance.$attachments.attached.map((attachment: Attachment) =>
      attachmentManager.delete(attachment)
    )
  )
}

/**
 * Persist attachment for a given attachment attributeName
 */
export async function persistAttachment(modelInstance: ModelWithAttachment, attributeName: string) {
  const existingFile = modelInstance.$original[attributeName] as Attachment
  const newFile = modelInstance.$attributes[attributeName] as Attachment
  const options = getOptions(modelInstance, attributeName)

  /**
   * Skip when the attachment attributeName hasn't been updated
   */
  if (existingFile === newFile) {
    return
  }

  /**
   * There was an existing file, but there is no new file. Hence we must
   * remove the existing file.
   */
  if (existingFile && !newFile) {
    existingFile.setOptions(options)
    modelInstance.$attachments.detached.push(existingFile)
    return
  }

  /**
   * If there is a new file and its local then we must save this
   * file.
   */
  if (newFile) {
    newFile.setOptions(options)

    modelInstance.$attachments.attached.push(newFile)

    /**
     * If there was an existing file, then we must get rid of it
     */
    if (existingFile) {
      existingFile.setOptions(options)
      modelInstance.$attachments.detached.push(existingFile)
    }

    /**
     * Also write the file to the disk right away
     */
    await attachmentManager.save(newFile)
  }
}

export async function preComputeUrl(modelInstance: ModelWithAttachment, attributeName: string) {
  const attachment = modelInstance.$attributes[attributeName] as Attachment
  const options = getOptions(modelInstance, attributeName)

  attachment.setOptions(options)

  return attachmentManager.preComputeUrl(attachment)
}

/**
 * Launch converter by variant option
 */
export async function generateVariants(modelInstance: ModelWithAttachment, attributeName: string) {
  attachmentManager.queue.push({
    name: `${modelInstance.constructor.name}-${attributeName}`,
    async run() {
      const converterManager = new ConverterManager({
        record: modelInstance,
        attributeName,
      })
      await converterManager.save()
    },
  })
  .onError = function (error: any) {
    if (error.message) {
      logger.error(error.message)
    } else {
      throw new E_CANNOT_CREATE_VARIANT([error])
    }
  }
}
