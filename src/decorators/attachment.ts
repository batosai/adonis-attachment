/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { AttachmentOptions } from '../types.js'
import { optionsSym } from '../utils/symbols.js'
import attachmentManager from '../../services/main.js'

export const attachment = (options?: AttachmentOptions) => {
  return function (target: any, propertyKey: string) {
    if (!target[optionsSym]) {
      target[optionsSym] = {}
    }
    target[optionsSym][propertyKey] = options

    const Model = target.constructor as LucidModel
    Model.boot()

    const { disk, folder, variants, ...columnOptions } = {
      disk: 'local',
      folder: 'uploads',
      variants: [],
      ...options,
    }

    Model.$addColumn(propertyKey, {
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
      serialize: (value) => (value ? value.toJSON() : null),
      ...columnOptions,
    })
  }
}
