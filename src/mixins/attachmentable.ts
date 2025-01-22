/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { BaseModel } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import type { AttributeOfModelWithAttachment } from '../types/mixin.js'

import {
  beforeSave,
  afterSave,
  beforeDelete,
  afterFind,
  afterFetch,
  afterPaginate,
  beforeFind,
  beforeFetch,
  beforePaginate,
  beforeCreate,
} from '@adonisjs/lucid/orm'
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
import logger from '@adonisjs/core/services/logger'

type Constructor = NormalizeConstructor<typeof BaseModel>

export function Attachmentable<T extends Constructor>(superclass: T) {
  class ModelWithAttachment extends superclass {
    $attachments: AttributeOfModelWithAttachment = clone(defaultStateAttributeMixin)

    @beforeCreate()
    @beforeFind()
    @beforeFetch()
    @beforePaginate()
    @beforeSave()
    static async warn() {
      logger.warn(`The "Attachmentable" mixin is deprecated and may be removed in a future version.`)
    }

    @afterFind()
    static async afterFindHook(modelInstance: ModelWithAttachment) {
      const attachmentAttributeNames = getAttachmentAttributeNames(modelInstance)

      await Promise.all(
        attachmentAttributeNames.map((attributeName) => {
          return preComputeUrl(modelInstance, attributeName)
        })
      )
    }

    @afterFetch()
    @afterPaginate()
    static async afterFetchHook(modelInstances: ModelWithAttachment[]) {
      await Promise.all(modelInstances.map((row) => this.afterFindHook(row)))
    }

    @beforeSave()
    static async beforeSaveHook(modelInstance: ModelWithAttachment) {
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

    @afterSave()
    static async afterSaveHook(modelInstance: ModelWithAttachment) {
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

    @beforeDelete()
    static async beforeDeleteHook(modelInstance: ModelWithAttachment) {
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
  }

  return ModelWithAttachment
}
