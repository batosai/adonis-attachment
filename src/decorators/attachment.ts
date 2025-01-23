/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { LucidOptions } from '../types/attachment.js'

import attachmentManager from '../../services/main.js'
import { optionsSym } from '../utils/symbols.js'
import { defaultOptionsDecorator } from '../utils/default_values.js'
import type { AttributeOfModelWithAttachment } from '../types/mixin.js'

import { afterFindHook, afterFetchHook, beforeSaveHook, afterSaveHook, beforeDeleteHook } from '../utils/hooks.js'


import {
  clone,
} from '../utils/helpers.js'
import { defaultStateAttributeMixin } from '../utils/default_values.js'

export const attachment = (options?: LucidOptions) => {
  return function (target: any, attributeName: string) {
    if (!target[optionsSym]) {
      target[optionsSym] = {}
    }

    target[optionsSym][attributeName] = options

    const Model = target.constructor as LucidModel & {
      $attachments: AttributeOfModelWithAttachment
    }
    Model.boot()

    Model.$attachments = clone(defaultStateAttributeMixin)

    /**
     * Registering all hooks only once
     */

    Model.after('find', afterFindHook)
    Model.after('fetch', afterFetchHook)
    Model.after('paginate', afterFetchHook)
    Model.before('save', beforeSaveHook)
    Model.after('save', afterSaveHook)
    Model.before('delete', beforeDeleteHook)

    const { disk, folder, variants, meta, rename, ...columnOptions } = {
      ...defaultOptionsDecorator,
      ...options,
    }

    Model.$addColumn(attributeName, {
      consume: (value) => {
        if (value) {
          const attachment = attachmentManager.createFromDbResponse(value)
          attachment?.setOptions({ disk, folder, variants })

          if (options && options?.meta !== undefined) {
            attachment?.setOptions({ meta: options!.meta })
          }
          if (options && options?.rename !== undefined) {
            attachment?.setOptions({ rename: options!.rename })
          }
          if (options && options?.preComputeUrl !== undefined) {
            attachment?.setOptions({ preComputeUrl: options!.preComputeUrl })
          }
          return attachment
        } else {
          return null
        }
      },
      prepare: (value) => (value ? JSON.stringify(value.toObject()) : null),
      serialize: (value) => (value ? value.toJSON() : null),
      ...columnOptions,
    })
  }
}
