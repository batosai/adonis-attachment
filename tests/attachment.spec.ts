/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'
import drive from '@adonisjs/drive/services/main'

import { UserFactory } from './fixtures/factories/user.js'

test.group('attachment', () => {
  test('delete', async ({ assert }) => {
    const user = await UserFactory.create()
    user.avatar = null
    await user.save()

    assert.isNull(user.avatar)
  })

  test('delete file after removing', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const user = await UserFactory.create()
    const path = user.avatar?.path
    user.avatar = null
    await user.save()

    fakeDisk.assertMissing(path!)
  })

  test('delete file after remove entity', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const user = await UserFactory.create()
    const path = user.avatar?.path
    await user.delete()

    fakeDisk.assertMissing(path!)
  })
})
