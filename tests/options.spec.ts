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
import sinon from 'sinon'

import BlurhashAdapter from '../src/adapters/blurhash.js'
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

  test('with rename=false, file is present (fix v4.0.4)', async ({ assert, cleanup }) => {
    const app = await createApp({
      rename: false,
    })
    const attachmentManager = await app.container.make('jrmc.attachment')
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    cleanup(() => {
      encodeStub.restore()
      app.terminate()
    })

    const avatar = await attachmentManager.createFromBase64(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII=',
      'avatar.jpg'
    )

    const user = await UserFactory.merge({
      avatar,
    }).create()

    const newFile = await attachmentManager.createFromBase64(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII=',
      'avatar.jpg'
    )

    user.avatar = newFile
    await user.save()

    await assert.fileExists(user.avatar!.path!)
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
