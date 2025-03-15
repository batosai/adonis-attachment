/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../src/types/attachment.js'

import { test } from '@japa/runner'
import sinon from 'sinon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import Factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'

import BlurhashAdapter from '../src/adapters/blurhash.js'
import { attachmentManager, attachment, attachments } from '../index.js'
import { makeAttachment } from './helpers/index.js'
import { createApp } from './helpers/app.js'

class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @attachment({ variants: ['thumbnail', 'medium'] })
  declare avatar: Attachment | null

  @attachments({ variants: ['thumbnail'] })
  declare weekendPics: Attachment[] | null

  @column.dateTime({ autoCreate: true, serialize: (value: DateTime) => value.toUnixInteger() })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}

const UserFactory = Factory.define(User, async ({ faker }) => {
  return {
    name: faker.person.lastName(),
    avatar: await makeAttachment(),
    weekendPics: [await makeAttachment(), await makeAttachment()],
  }
}).build()

test.group('variants', () => {
  test('generation', async ({ assert, cleanup }) => {
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')

    cleanup(() => {
      encodeStub.restore()
    })

    // const notifier = attachmentManager.queue.createNotifier()
    //   const user = await UserFactory.create()
    // await notifier

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const data = await user.serialize()

    assert.exists(data.avatar.thumbnail)
    assert.exists(data.avatar.medium)

    assert.exists(data.weekendPics[0].thumbnail)
    assert.exists(data.weekendPics[1].thumbnail)
  }) //.timeout(25_000)

  test('delete files after remove avatars', async ({ assert, cleanup }) => {
    const app = await createApp()
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    cleanup(() => {
      encodeStub.restore()
      app.terminate()
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const variants = user.avatar?.variants

    variants?.forEach(async (variant) => {
      await assert.fileExists(variant.path!)
    })

    user.avatar = null
    await user.save()

    variants?.forEach(async (variant) => {
      await assert.fileNotExists(variant.path!)
    })
  })

  test('delete files after remove weekendPics', async ({ assert, cleanup }) => {
    const app = await createApp()
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    cleanup(() => {
      encodeStub.restore()
      app.terminate()
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const weekendPicsVariants0 = user.weekendPics![0]?.variants
    const weekendPicsVariants1 = user.weekendPics![1]?.variants

    weekendPicsVariants0?.forEach(async (variant) => {
      await assert.fileExists(variant.path!)
    })

    weekendPicsVariants1?.forEach(async (variant) => {
      await assert.fileExists(variant.path!)
    })

    user.weekendPics = null
    await user.save()

    weekendPicsVariants0?.forEach(async (variant) => {
      await assert.fileNotExists(variant.path!)
    })

    weekendPicsVariants1?.forEach(async (variant) => {
      await assert.fileNotExists(variant.path!)
    })
  })

  test('delete files after remove partial weekendPics', async ({ assert, cleanup }) => {
    const app = await createApp()
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    cleanup(() => {
      encodeStub.restore()
      app.terminate()
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const weekendPicsVariants0 = user.weekendPics![0]?.variants
    const weekendPicsVariants1 = user.weekendPics![1]?.variants

    // 0 is regenerate
    weekendPicsVariants0?.forEach(async (variant) => {
      await assert.fileExists(variant.path!)
    })

    // 1 is delete
    weekendPicsVariants1?.forEach(async (variant) => {
      await assert.fileExists(variant.path!)
    })

    user.weekendPics = [user.weekendPics![0]]
    await user.save()

    const data = await user.serialize()

    // 0 is regenerate
    weekendPicsVariants0?.forEach(async (variant) => {
      await assert.fileExists(variant.path!)
    })
    assert.exists(data.weekendPics[0].thumbnail)

    // 1 is delete
    weekendPicsVariants1?.forEach(async (variant) => {
      await assert.fileNotExists(variant.path!)
    })
    assert.lengthOf(data.weekendPics, 1)
  })

  test('delete files after delete entity', async ({ assert, cleanup }) => {
    const app = await createApp()
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    cleanup(() => {
      encodeStub.restore()
      app.terminate()
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const variants = user.avatar?.variants
    const weekendPicsVariants0 = user.weekendPics![0]?.variants
    const weekendPicsVariants1 = user.weekendPics![1]?.variants

    variants?.forEach(async (variant) => {
      await assert.fileExists(variant.path!)
    })

    weekendPicsVariants0?.forEach(async (variant) => {
      await assert.fileExists(variant.path!)
    })

    weekendPicsVariants1?.forEach(async (variant) => {
      await assert.fileExists(variant.path!)
    })

    await user.delete()

    variants?.forEach(async (variant) => {
      await assert.fileNotExists(variant.path!)
    })

    weekendPicsVariants0?.forEach(async (variant) => {
      await assert.fileNotExists(variant.path!)
    })

    weekendPicsVariants1?.forEach(async (variant) => {
      await assert.fileNotExists(variant.path!)
    })
  })

  test('blurhash', async ({ assert, cleanup }) => {
    const app = await createApp()
    const file = await attachmentManager.createFromBase64(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII=',
      'file.png'
    )

    cleanup(() => app.terminate())

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.merge({
      avatar: null,
      weekendPics: [file],
    }).create()
    await notifier

    const data = await user.serialize()

    assert.exists(data.weekendPics[0].thumbnail.blurhash)
  })
})
