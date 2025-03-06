/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'
import drive from '@adonisjs/drive/services/main'

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

    assert.isNotNull(data.weekendPics[0].thumbnail)
    assert.isNotNull(data.weekendPics[1].thumbnail)
  }).timeout(10_000)

  test('delete files after remove avatars', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    const app = await createApp()
    cleanup(() => {
      drive.restore('fs')
      app.terminate()
    })

    const user = await UserFactory.create()
    const variants = user.avatar?.variants
    user.avatar = null
    await user.save()

    variants?.forEach((variant) => {
      fakeDisk.assertMissing(variant.path!)
    })
  })

  test('delete files after remove weekendPics', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    const app = await createApp()
    cleanup(() => {
      drive.restore('fs')
      app.terminate()
    })

    const user = await UserFactory.create()
    const weekendPicsVariants0 = user.weekendPics![0]?.variants
    const weekendPicsVariants1 = user.weekendPics![1]?.variants
    user.weekendPics = null
    await user.save()

    weekendPicsVariants0?.forEach((variant) => {
      fakeDisk.assertMissing(variant.path!)
    })

    weekendPicsVariants1?.forEach((variant) => {
      fakeDisk.assertMissing(variant.path!)
    })
  })

  test('delete files after remove partial weekendPics', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    const app = await createApp()
    cleanup(() => {
      drive.restore('fs')
      app.terminate()
    })

    const user = await UserFactory.create()
    const weekendPicsVariants0 = user.weekendPics![0]?.variants
    const weekendPicsVariants1 = user.weekendPics![1]?.variants
    user.weekendPics = [ user.weekendPics![0] ]
    await user.save()

    const data = await user.serialize()

    // 0 is regenerate
    weekendPicsVariants0?.forEach((variant) => {
      fakeDisk.assertMissing(variant.path!)
    })
    assert.isNotNull(data.weekendPics[0].thumbnail)

    // 1 is delete
    weekendPicsVariants1?.forEach((variant) => {
      fakeDisk.assertMissing(variant.path!)
    })
    assert.lengthOf(data.weekendPics, 1)
  })

  test('delete files after delete entity', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    const app = await createApp()
    cleanup(() => {
      drive.restore('fs')
      app.terminate()
    })

    const user = await UserFactory.create()
    const variants = user.avatar?.variants
    const weekendPicsVariants0 = user.weekendPics![0]?.variants
    const weekendPicsVariants1 = user.weekendPics![1]?.variants
    await user.delete()

    variants?.forEach((variant) => {
      fakeDisk.assertMissing(variant.path!)
    })

    weekendPicsVariants0?.forEach((variant) => {
      fakeDisk.assertMissing(variant.path!)
    })

    weekendPicsVariants1?.forEach((variant) => {
      fakeDisk.assertMissing(variant.path!)
    })
  })
})
