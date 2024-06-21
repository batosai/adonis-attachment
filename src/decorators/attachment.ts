/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { AttachmentOptions } from '../types.js'
import  { optionsSym } from '../utils/symbols.js'
import attachmentManager from '../../services/main.js'

export const attachment = (options?: AttachmentOptions) => {
  return function (target: any, propertyKey: string) {
    // let value = target[propertyKey] // as Attachment
    if (!target[optionsSym]) {
      target[optionsSym] = {}
    }
    target[optionsSym][propertyKey] = options

    const Model = target.constructor as LucidModel
    Model.boot()

    const { disk, folder, ...columnOptions } = options || {
      disk: 'fs',
      folder: 'uploads'
    }

    Model.$addColumn(propertyKey, {
      consume: (value) => {
        if (value) {
          return attachmentManager.createFromDbResponse(value)
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



