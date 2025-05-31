/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import type { Attachment } from '../src/types/attachment.js'

import { BaseModel, column } from '@adonisjs/lucid/orm'
import Factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import { assert } from '@japa/assert'
import { createApp } from './helpers/app.js'
import { UserFactory } from './fixtures/factories/user.js'
import { makeAttachment } from './helpers/index.js'
import { attachment } from '../index.js'

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

  test('with dynamic folder with date', async ({ assert, cleanup }) => {
    class User extends BaseModel {
      @column()
      declare name: string

      @attachment({ folder: () => DateTime.now().toFormat('yyyy/MM') })
      declare avatar: Attachment | null
    }

    const UserFactory = Factory.define(User, async ({ faker }) => {
      return {
        name: faker.person.lastName(),
        avatar: await makeAttachment(),
      }
    }).build()

    const app = await createApp({
      rename: false,
    })

    cleanup(() => {
      app.terminate()
    })

    const user = await UserFactory.create()

    assert.equal(user.avatar?.path, `${DateTime.now().toFormat('yyyy/MM')}/avatar.jpg`)
  })

  test('with dynamic folder with attribute', async ({ assert, cleanup }) => {
    class User extends BaseModel {
      @column()
      declare name: string

      @attachment({ folder: (u: User) => u.name })
      declare avatar: Attachment | null
    }

    const UserFactory = Factory.define(User, async ({ faker }) => {
      return {
        name: faker.person.lastName(),
        avatar: await makeAttachment(),
      }
    }).build()

    const app = await createApp({
      rename: false,
    })

    cleanup(() => {
      app.terminate()
    })

    const user = (await UserFactory.merge({
      name: 'jeremy',
    }).create()) as User

    assert.equal(user.avatar?.path, 'jeremy/avatar.jpg')
  })

  test('with dynamic folder with path parameter', async ({ assert, cleanup }) => {
    class User extends BaseModel {
      @column()
      declare name: string

      @attachment({ folder: 'user/:name' })
      declare avatar: Attachment | null
    }

    const UserFactory = Factory.define(User, async ({ faker }) => {
      return {
        name: faker.person.lastName(),
        avatar: await makeAttachment(),
      }
    }).build()

    const app = await createApp({
      rename: false,
    })

    cleanup(() => {
      app.terminate()
    })

    const user = (await UserFactory.merge({
      name: 'jeremy',
    }).create()) as User

    assert.equal(user.avatar?.path, 'user/jeremy/avatar.jpg')
  })

  test('with dynamic folder - delete', async ({ assert, cleanup }) => {
    const app = await createApp({
      rename: false,
    })
    cleanup(() => app.terminate())

    class User extends BaseModel {
      @column({ isPrimary: true })
      declare id: string

      @column()
      declare name: string

      @attachment({ folder: () => `avatar/:name/${DateTime.now().toFormat('yyyy/MM')}` })
      declare avatar: Attachment | null
    }

    const UserFactory = Factory.define(User, async ({ faker }) => {
      return {
        name: 'jeremy',
        avatar: await makeAttachment(),
      }
    }).build()

    const user = await UserFactory.create()
    const path = user.avatar?.path

    assert.equal(path, `avatar/jeremy/${DateTime.now().toFormat('yyyy/MM')}/avatar.jpg`)
    await assert.fileExists(path!)

    user.avatar = null
    await user.save()

    await assert.fileNotExists(path!)
  })
})
