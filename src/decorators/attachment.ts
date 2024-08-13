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

export const attachment = (options?: LucidOptions) => {
  return function (target: any, attributeName: string) {
    if (!target[optionsSym]) {
      target[optionsSym] = {}
    }
    target[optionsSym][attributeName] = options

    const Model = target.constructor as LucidModel
    Model.boot()

    const { disk, folder, variants, ...columnOptions } = {
      ...defaultOptionsDecorator,
      ...options,
    }

    Model.$addColumn(attributeName, {
      consume: (value) => {
        if (value) {
          const attachment = attachmentManager.createFromDbResponse(value)
          attachment?.setOptions({ disk, folder, variants })
          return attachment
        } else {
          return null
        }
      },
      prepare: (value) => (value ? JSON.stringify(value.toObject()) : null),
      serialize: async (value) => (value ? await value.toJSON() : null),
      ...columnOptions,
    })
  }
}
