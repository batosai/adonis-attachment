/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { createApp } from './helpers/app.js'
import { UserFactory } from './fixtures/factories/user.js'

test.group('options', () => {
  test('with default values', async ({ assert, cleanup }) => {
    const app = await createApp()

    cleanup(() => {
      app.terminate()
    })

    const user = await UserFactory.create()

    assert.deepEqual(user!.avatar!.options, {
      disk: undefined,
      folder: 'uploads',
      preComputeUrl: false,
      variants: [],
      meta: true,
      rename: true,
    })
  })

  test('with config values', async ({ assert, cleanup }) => {
    const app = await createApp({
      preComputeUrl: true,
      meta: false,
      rename: false,
    })

    cleanup(() => {
      app.terminate()
    })

    const user = await UserFactory.create()

    assert.deepEqual(user!.avatar!.options, {
      disk: undefined,
      folder: 'uploads',
      preComputeUrl: true,
      variants: [],
      meta: false,
      rename: false,
    })
  })

  test('with model values', async ({ assert, cleanup }) => {
    const app = await createApp()
    const attachmentManager = await app.container.make('jrmc.attachment')

    cleanup(() => {
      app.terminate()
    })

    const avatar2 = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo123.jpg',
        originalName: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    const user = await UserFactory.merge({ avatar2 }).create()

    assert.deepEqual(user!.avatar2!.options, {
      disk: 's3',
      folder: 'avatar',
      preComputeUrl: true,
      variants: [],
      meta: false,
      rename: false,
    })
  })

  test('with priority 1/model 2/config 3/default values', async ({ assert, cleanup }) => {
    const app = await createApp({
      preComputeUrl: false,
      meta: true,
      rename: true,
    })
    const attachmentManager = await app.container.make('jrmc.attachment')

    cleanup(() => {
      app.terminate()
    })

    const avatar2 = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo123.jpg',
        originalName: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    const user = await UserFactory.merge({ avatar2 }).create()

    assert.deepEqual(user!.avatar2!.options, {
      disk: 's3',
      folder: 'avatar',
      preComputeUrl: true,
      variants: [],
      meta: false,
      rename: false,
    })
  })

  test('with rename options', async ({ assert, cleanup }) => {
    const app = await createApp({
      rename: true,
    })
    const attachmentManager = await app.container.make('jrmc.attachment')

    cleanup(() => {
      app.terminate()
    })

    const avatar2 = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo123.jpg',
        originalName: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    const user = await UserFactory.merge({ avatar2 }).create()
    const data = user.serialize()

    assert.notEqual(data.avatar.name, 'avatar.jpg')
    assert.equal(data.avatar2.name, 'foo.jpg')
  })

  test('with meta options', async ({ assert, cleanup }) => {
    const app = await createApp({
      meta: true,
    })

    cleanup(() => {
      app.terminate()
    })

    const user = await UserFactory.create()
    const data = user.serialize()

    assert.deepEqual(data.avatar.meta, { dimension: { width: 1920, height: 1313 } })
  })
})
