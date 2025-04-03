/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LucidModel } from '@adonisjs/lucid/types/model'
import type { Attachment, LucidOptions } from '../types/attachment.js'

import attachmentManager from '../../services/main.js'
import { optionsSym } from '../utils/symbols.js'
import { defaultOptionsDecorator } from '../utils/default_values.js'
import type { AttributeOfRowWithAttachment } from '../types/mixin.js'

import {
  afterFindHook,
  afterFetchHook,
  beforeSaveHook,
  afterSaveHook,
  beforeDeleteHook,
} from '../utils/hooks.js'

import { defaultStateAttributeMixin } from '../utils/default_values.js'

export const bootModel = (
  model: LucidModel & {
    $attachments: AttributeOfRowWithAttachment
  }
) => {
  model.boot()

  model.$attachments = structuredClone(defaultStateAttributeMixin)

  /**
   * Registering all hooks only once
   */
  if (!model.$hooks.has('find', afterFindHook)) {
    model.after('find', afterFindHook)
  }
  if (!model.$hooks.has('fetch', afterFetchHook)) {
    model.after('fetch', afterFetchHook)
  }
  if (!model.$hooks.has('paginate', afterFetchHook)) {
    model.after('paginate', afterFetchHook)
  }
  if (!model.$hooks.has('save', beforeSaveHook)) {
    model.before('save', beforeSaveHook)
  }
  if (!model.$hooks.has('save', afterSaveHook)) {
    model.after('save', afterSaveHook)
  }
  if (!model.$hooks.has('delete', beforeDeleteHook)) {
    model.before('delete', beforeDeleteHook)
  }
}

const makeColumnOptions = (options?: LucidOptions) => {
  const { disk, folder, variants, meta, rename, ...columnOptions } = {
    ...defaultOptionsDecorator,
    ...options,
  }

  return {
    consume: (value?: string | JSON) => {
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
    prepare: (value?: Attachment) => (value ? JSON.stringify(value.toObject()) : null),
    serialize: (value?: Attachment) => (value ? value.toJSON() : null),
    ...columnOptions,
  }
}

const makeAttachmentDecorator =
  (columnOptionsTransformer?: (columnOptions: any) => any) => (options?: LucidOptions) => {
    return function (target: any, attributeName: string) {
      if (!target[optionsSym]) {
        target[optionsSym] = {}
      }

      target[optionsSym][attributeName] = options

      const Model = target.constructor as LucidModel & {
        $attachments: AttributeOfRowWithAttachment
      }

      bootModel(Model)

      const columnOptions = makeColumnOptions(options)
      const transformedColumnOptions = columnOptionsTransformer
        ? columnOptionsTransformer(columnOptions)
        : columnOptions
      Model.$addColumn(attributeName, transformedColumnOptions)
    }
  }

export const attachment = makeAttachmentDecorator()
export const attachments = makeAttachmentDecorator((columnOptions) => ({
  consume: (value?: string | JSON) => {
    if (value) {
      const data = typeof value === 'string' ? JSON.parse(value) : value
      return data.map(columnOptions.consume)
    }
    return null
  },
  prepare: (value?: Attachment[]) =>
    value ? JSON.stringify(value.map((v) => v.toObject())) : null,
  serialize: (value?: Attachment[]) => (value ? value.map(columnOptions.serialize) : null),
}))
