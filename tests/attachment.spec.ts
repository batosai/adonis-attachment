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

  test('delete file after removing', async ({ cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const user = await UserFactory.create()
    const path = user.avatar?.path
    user.avatar = null
    await user.save()

    fakeDisk.assertMissing(path!)
  })

  test('delete file after remove entity', async ({ cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const user = await UserFactory.create()
    const path = user.avatar?.path
    await user.delete()

    fakeDisk.assertMissing(path!)
  })
})

test.group('attachments', () => {
  test('create', async ({ assert }) => {
    const user = await UserFactory.create()

    assert.exists(user.weekendPics)
    assert.equal(user.weekendPics?.length, 2)
    for (const pic of user.weekendPics ?? []) {
      assert.equal(pic.originalName, 'avatar.jpg')
      assert.match(pic.name, /(.*).jpg$/)
      assert.equal(pic.mimeType, 'image/jpeg')
      assert.equal(pic.extname, 'jpg')
    }
  })

  test('delete files after removing', async ({ cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const user = await UserFactory.create()
    const paths = user.weekendPics?.map((p) => p.path)
    user.weekendPics = null
    await user.save()

    for (const path of paths ?? []) fakeDisk.assertMissing(path!)
  })

  test('delete files after remove entity', async ({ cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const user = await UserFactory.create()
    const paths = user.weekendPics?.map((p) => p.path)
    await user.delete()

    for (const path of paths ?? []) {
      fakeDisk.assertMissing(path!)
    }
  })
})
