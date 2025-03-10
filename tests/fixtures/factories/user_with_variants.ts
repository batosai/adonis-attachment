/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { readFile } from 'node:fs/promises'
import User from '../models/user_with_variants.js'
import Factory from '@adonisjs/lucid/factories'
import app from '@adonisjs/core/services/app'

export const UserFactory = Factory.define(User, async ({ faker }) => {
  const makeAttachment = async () => {
    const attachmentManager = await app.container.make('jrmc.attachment')
    const buffer = await readFile(app.makePath('../fixtures/images/img.jpg'))
    return attachmentManager.createFromBuffer(buffer, 'avatar.jpg')
  }

  return {
    name: faker.person.lastName(),
    avatar: await makeAttachment(),
    weekendPics: [await makeAttachment(), await makeAttachment()],
  }
}).build()
