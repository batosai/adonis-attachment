/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../types/attachment.js'
import type { ModelWithAttachment } from '../types/mixin.js'

import attachmentManager from '../../services/main.js'
import { getOptions } from './helpers.js'
import { ConverterManager } from '../converter_manager.js'

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
 * Persist attachment for a given attachment property
 */
export async function persistAttachment(modelInstance: ModelWithAttachment, property: string) {
  const existingFile = modelInstance.$original[property] as Attachment
  const newFile = modelInstance.$attributes[property] as Attachment
  const options = getOptions(modelInstance, property)

  /**
   * Skip when the attachment property hasn't been updated
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
  // if (newFile && newFile.isLocal) {
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

/**
 * Launch converter by variant option
 */
export async function generateVariants(modelInstance: ModelWithAttachment, attributeName: string) {
  const options = getOptions(modelInstance, attributeName)

  if (options.variants) {
    options.variants.forEach(async (option) => {
      const attachment = modelInstance.$attributes[attributeName] as Attachment
      const converter = await attachmentManager.getConverter(option)

      if (attachment && converter) {
        const converterManager = new ConverterManager({
          record: modelInstance,
          attributeName,
          key: option,
          converter,
        })
        converterManager.save()
      }
    })
  }
}
