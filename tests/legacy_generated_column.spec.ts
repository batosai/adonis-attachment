import { BaseModel, column } from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import { attachment } from '../src/integrations/legacy/index.js'

test('legacy fields take over inherited generated JSON columns', ({ assert }) => {
  class GeneratedSchema extends BaseModel {
    @column()
    declare avatar: string
  }

  class User extends GeneratedSchema {}

  attachment()(User.prototype, 'avatar')

  assert.isTrue(GeneratedSchema.$hasColumn('avatar'))
  assert.isFalse(User.$hasColumn('avatar'))
  assert.isUndefined(User.$keys.columnsToAttributes.get('avatar'))

  const user = new User()
  user.$consumeAdapterResult({ avatar: '{"name":"avatar.jpg"}' })

  assert.equal(user.$extras.avatar, '{"name":"avatar.jpg"}')
  assert.isUndefined(user.$attributes.avatar)
})
