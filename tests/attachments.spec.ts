/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */
import { readFile } from 'node:fs/promises'

import app from '@adonisjs/core/services/app'
import '@japa/assert'
import { test } from '@japa/runner'
import drive from '@adonisjs/drive/services/main'

import { UserFactory } from './fixtures/factories/user.js'

test.group('attachments', () => {
  test('create', async ({ assert }) => {
    const user = await UserFactory.create()
    
    assert.isNotNull(user.weekendPics)
    assert.equal(user.weekendPics?.length, 2)
    for (const pic of user.weekendPics ?? []) {
      assert.equal(pic.originalName, 'avatar.jpg')
      assert.match(pic.name, /(.*).jpg$/)
      assert.equal(pic.mimeType, 'image/jpeg')
      assert.equal(pic.extname, 'jpg')
    }
  })

  test('delete files after removing', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const user = await UserFactory.create()
    const paths = user.weekendPics?.map(p => p.path)
    user.weekendPics = []
    await user.save()

    for (const path of paths ?? [])
      fakeDisk.assertMissing(path!)
  })

  test('delete files after remove entity', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const user = await UserFactory.create()
    const paths = user.weekendPics?.map(p => p.path)
    await user.delete()

    for (const path of paths ?? [])
      fakeDisk.assertMissing(path!)
  })
})
