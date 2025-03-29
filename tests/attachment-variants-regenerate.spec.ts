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

import RegenerateService from '../services/regenerate_service.js'

import BlurhashAdapter from '../src/adapters/blurhash.js'
import { attachmentManager, attachment } from '../index.js'
import { makeAttachment } from './helpers/index.js'

class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @attachment({ variants: ['thumbnail'] })
  declare avatar: Attachment | null

  @attachment({ variants: ['thumbnail', 'medium'] })
  declare avatar2: Attachment | null
}

const UserFactory = Factory.define(User, async () => {
  return {
    avatar: await makeAttachment(),
    avatar2: await makeAttachment(),
  }
}).build()

test.group('regenerate - model class', (group) => {
  test('with just model class', async ({ assert, cleanup }) => {
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    const regenerate = new RegenerateService()

    cleanup(() => {
      encodeStub.restore()
    })

    await User.query().delete()

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const variant = user.avatar?.variants![0]

    const notifierRegen = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await regenerate.model(User).run()
    await notifierRegen

    await user.refresh()

    const variantRegen = user.avatar?.variants![0]

    await assert.fileNotExists(variant!.path!)
    await assert.fileExists(variantRegen!.path!)
    await assert.notEqual(variant!.path, variantRegen!.path)
  })

  test('with specify attribute', async ({ assert, cleanup }) => {
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    const regenerate = new RegenerateService()

    cleanup(() => {
      encodeStub.restore()
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const variant = user.avatar?.variants![0]
    const variant2 = user.avatar2?.variants![0]

    const notifierRegen = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await regenerate.model(User, {
      attributes: ['avatar']
    }).run()
    await notifierRegen

    await user.refresh()

    const variantRegen = user.avatar?.variants![0]
    const variant2Regen = user.avatar2?.variants![0]

    await assert.fileNotExists(variant!.path!)
    await assert.fileExists(variant2!.path!)
    await assert.fileExists(variantRegen!.path!)

    await assert.equal(variant2!.path, variant2Regen!.path)
  })

  test('with specify variant', async ({ assert, cleanup }) => {
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    const regenerate = new RegenerateService()

    cleanup(() => {
      encodeStub.restore()
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const thumbVariant = user.avatar2?.variants?.filter((v) => v.key === 'thumbnail')[0]
    const mediumVariant = user.avatar2?.variants?.filter((v) => v.key === 'medium')[0]

    const notifierRegen = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await regenerate.model(User, {
      attributes: ['avatar2'],
      variants: ['thumbnail']
    }).run()
    await notifierRegen

    await user.refresh()

    const thumbVariantRegen = user.avatar2?.variants?.filter((v) => v.key === 'thumbnail')[0]
    const mediumVariantRegen = user.avatar2?.variants?.filter((v) => v.key === 'medium')[0]

    await assert.notEqual(thumbVariant!.path, thumbVariantRegen!.path)
    await assert.equal(mediumVariant!.path, mediumVariantRegen!.path)
  })
})


test.group('regenerate - model instance', (group) => {
  test('with just model instance', async ({ assert, cleanup }) => {
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    const regenerate = new RegenerateService()

    cleanup(() => {
      encodeStub.restore()
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const variant = user.avatar?.variants![0]
    const variant2 = user.avatar2?.variants![0]

    const notifierRegen = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await regenerate.row(user).run()
    await notifierRegen

    const variantRegen = user.avatar?.variants![0]
    const variant2Regen = user.avatar2?.variants![0]

    await assert.fileNotExists(variant!.path!)
    await assert.fileExists(variantRegen!.path!)

    await assert.notEqual(variant2!.path, variant2Regen!.path)
  })

  test('with specify attribute', async ({ assert, cleanup }) => {
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    const regenerate = new RegenerateService()

    cleanup(() => {
      encodeStub.restore()
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const variant = user.avatar?.variants![0]
    const variant2 = user.avatar2?.variants![0]

    const notifierRegen = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await regenerate.row(user, {
      attributes: ['avatar']
    }).run()
    await notifierRegen

    const variantRegen = user.avatar?.variants![0]
    const variant2Regen = user.avatar2?.variants![0]

    await assert.fileNotExists(variant!.path!)
    await assert.fileExists(variant2!.path!)
    await assert.fileExists(variantRegen!.path!)

    await assert.equal(variant2!.path, variant2Regen!.path)
  })

  test('with specify variant', async ({ assert, cleanup }) => {
    const encodeStub = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    const regenerate = new RegenerateService()

    cleanup(() => {
      encodeStub.restore()
    })

    const notifier = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    const user = await UserFactory.create()
    await notifier

    const thumbVariant = user.avatar2?.variants?.filter((v) => v.key === 'thumbnail')[0]
    const mediumVariant = user.avatar2?.variants?.filter((v) => v.key === 'medium')[0]

    const notifierRegen = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await regenerate.row(user, {
      attributes: ['avatar2'],
      variants: ['thumbnail']
    }).run()
    await notifierRegen

    const thumbVariantRegen = user.avatar2?.variants?.filter((v) => v.key === 'thumbnail')[0]
    const mediumVariantRegen = user.avatar2?.variants?.filter((v) => v.key === 'medium')[0]


    await assert.notEqual(thumbVariant!.path, thumbVariantRegen!.path)
    await assert.equal(mediumVariant!.path, mediumVariantRegen!.path)
  })
})
