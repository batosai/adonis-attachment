/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { createApp } from './helpers/app.js'
import { UserFactory } from './fixtures/factories/user_with_variants.js'

test.group('variants', () => {
  test('generation', async ({ assert, cleanup }) => {
    const app = await createApp()

    cleanup(() => {
      app.terminate()
    })

    const user = await UserFactory.create()
    const data = await user.serialize()

    assert.isNotNull(data.avatar.thumbnail)
    assert.isNotNull(data.avatar.medium)
  }).timeout(10_000)
})
