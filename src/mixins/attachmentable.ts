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
  }

  return ModelWithAttachment
}
