/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import Factory from '@adonisjs/lucid/factories'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

import { makeAttachment } from '../../helpers/index.js'
import { attachment, attachments } from '../../../index.js'
import type { Attachment } from '../../../src/types/attachment.js'

export default class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @attachment()
  declare avatar: Attachment | null

  @attachment({ disk: 's3', folder: 'avatar', preComputeUrl: true, meta: false, rename: false })
  declare avatar2: Attachment | null

  @attachments({ preComputeUrl: true })
  declare weekendPics: Attachment[] | null

  @column.dateTime({ autoCreate: true, serialize: (value: DateTime) => value.toUnixInteger() })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}

export const UserFactory = Factory.define(User, async ({ faker }) => {
  return {
    name: faker.person.lastName(),
    avatar: await makeAttachment(),
    weekendPics: [await makeAttachment(), await makeAttachment()],
  }
}).build()
