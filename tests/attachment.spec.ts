/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'
import { UserFactory } from './fixtures/factories/user.js'

test.group('attachment', () => {
  test('delete', async ({ assert }) => {
    const user = await UserFactory.create()
    user.avatar = null
    await user.save()

    assert.isNull(user.avatar)
  })
})
