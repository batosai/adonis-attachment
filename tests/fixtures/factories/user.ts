import User from '../models/user.js'
import Factory from '@adonisjs/lucid/factories'
import app from '@adonisjs/core/services/app'

export const UserFactory = Factory.define(User, async ({ faker }) => {
  const attachmentManager = await app.container.make('jrmc.attachment')

  const attachment = attachmentManager.createFromDbResponse(
    JSON.stringify({
      size: 1440,
      name: 'foo123.jpg',
      originalName: 'foo.jpg',
      extname: 'jpg',
      mimeType: 'image/jpg',
    })
  )

  const attachment2 = attachmentManager.createFromDbResponse(
    JSON.stringify({
      size: 1440,
      name: 'foo123.jpg',
      originalName: 'foo.jpg',
      extname: 'jpg',
      mimeType: 'image/jpg',
    })
  )

  return {
    name: faker.person.lastName(),
    avatar: attachment,
    avatar2: attachment2,
  }
}).build()
