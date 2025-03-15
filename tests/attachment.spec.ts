/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { UserFactory } from './fixtures/factories/user.js'
import { createApp } from './helpers/app.js'

test.group('attachment', () => {
  test('create', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())

    const user = await UserFactory.create()

    assert.exists(user.avatar)
    await assert.fileExists(user.avatar?.path!)
  })
  test('delete', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())

    const user = await UserFactory.create()
    user.avatar = null
    await user.save()

    assert.isNull(user.avatar)
  })

  test('delete file after removing', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())

    const user = await UserFactory.create()
    const path = user.avatar?.path
    await assert.fileExists(path!)
    user.avatar = null
    await user.save()

    await assert.fileNotExists(path!)
  })

  test('delete file after remove entity', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())

    const user = await UserFactory.create()
    const path = user.avatar?.path
    await assert.fileExists(path!)
    await user.delete()

    await assert.fileNotExists(path!)
  })
})

test.group('attachments', () => {
  test('create', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())

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

  test('delete files after removing', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())

    const user = await UserFactory.create()
    const paths = user.weekendPics?.map((p) => p.path)

    for (const path of paths ?? []) {
      await assert.fileExists(path!)
    }

    user.weekendPics = null
    await user.save()

    for (const path of paths ?? []) {
      await assert.fileNotExists(path!)
    }
  })

  test('delete files after remove entity', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())

    const user = await UserFactory.create()
    const paths = user.weekendPics?.map((p) => p.path)

    for (const path of paths ?? []) {
      await assert.fileExists(path!)
    }

    await user.delete()

    for (const path of paths ?? []) {
      await assert.fileNotExists(path!)
    }
  })
})
