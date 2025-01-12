/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { attachment } from '../../../index.js'
import { Attachmentable } from '../../../src/mixins/attachmentable.js'
import type { Attachment } from '../../../src/types/attachment.js'
import { DateTime } from 'luxon'

export default class User extends compose(BaseModel, Attachmentable) {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @attachment()
  declare avatar: Attachment | null

  @attachment({ disk: 's3', folder: 'avatar', preComputeUrl: true, meta: false, rename: false })
  declare avatar2: Attachment | null

  @column.dateTime({ autoCreate: true, serialize: (value: DateTime) => value.toUnixInteger() })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
