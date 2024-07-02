/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { BaseModel } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import type { ModelWithAttachmentAttribute } from '../types/mixin.js'
import { beforeSave, afterSave, beforeDelete } from '@adonisjs/lucid/orm'
import { persistAttachment, commit, rollback, generateVariants } from '../utils/actions.js'
import { getAttachmentTypeAttributes } from '../utils/helpers.js'

export const Attachmentable = <Model extends NormalizeConstructor<typeof BaseModel>>(
  superclass: Model
) => {
  class ModelWithAttachment extends superclass {
    $attachments: ModelWithAttachmentAttribute = {
      attached: [],
      detached: [],
      propertiesModified: []
    }

    @beforeSave()
    static async beforeSaveHook(modelInstance: ModelWithAttachment) {
      const attributeAttachments = getAttachmentTypeAttributes(modelInstance)

      /**
       * Set properties modified
       */
      attributeAttachments.forEach((property) => {
        if (modelInstance.$dirty[property]) {
          modelInstance.$attachments.propertiesModified.push(property)
        }
      })

      /**
       * Persist attachments before saving the model to the database. This
       * way if file saving fails we will not write anything to the
       * database
       */
      await Promise.all(
        attributeAttachments.map((property) => persistAttachment(modelInstance, property))
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

    @afterSave()
    static async afterSaveHook(modelInstance: ModelWithAttachment) {
      const attributeAttachments = getAttachmentTypeAttributes(modelInstance)

      /**
       * For all properties Attachment
       * Launch async generation variants
       */
      await Promise.all(
        attributeAttachments.map((property) => {
          if (modelInstance.$attachments.propertiesModified.includes(property)) {
            return generateVariants(modelInstance, property)
          }
        })
      )
    }

    @beforeDelete()
    static async beforeDeleteHook(modelInstance: ModelWithAttachment) {
      const attributeAttachments = getAttachmentTypeAttributes(modelInstance)

      /**
       * Mark all attachments for deletion
       */
      attributeAttachments.map((property) => {
        if (modelInstance.$attributes[property]) {
          modelInstance.$attachments.detached.push(modelInstance.$attributes[property])
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
  }

  return ModelWithAttachment
}
