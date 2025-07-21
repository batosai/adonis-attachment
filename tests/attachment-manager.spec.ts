/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'

test.group('attachment-manager', () => {
  test('save method - should result in noop when attachment is created from db response', async ({
    assert,
  }) => {
    const attachmentManager = await app.container.make('jrmc.attachment')

    const attachment = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo123.jpg',
        originalName: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    assert.equal(attachment?.originalName, 'foo.jpg')
  })

  test('Attachment - should be null when db response is null', async ({ assert }) => {
    const attachmentManager = await app.container.make('jrmc.attachment')

    const attachment = attachmentManager.createFromDbResponse(null as any)
    assert.isNull(attachment)
  })

  test('Attachment path default is uploads', async ({ assert }) => {
    const attachmentManager = await app.container.make('jrmc.attachment')

    const attachment = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    assert.equal(attachment?.path!, 'uploads/foo.jpg')
  })

  test('Attachment path - should be custom', async ({ assert }) => {
    const attachmentManager = await app.container.make('jrmc.attachment')

    const attachment = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    attachment?.setOptions({ folder: 'avatar' })

    assert.equal(attachment?.path!, 'avatar/foo.jpg')
  })

  test('Attachment get url', async ({ assert, cleanup }) => {
    drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const attachmentManager = await app.container.make('jrmc.attachment')
    const attachment = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    attachment?.setOptions({ folder: 'avatars' })

    const url = await attachment?.getUrl()
    const signedUrl = await attachment?.getSignedUrl()

    assert.match(url!, /\/drive\/fakes\/avatars\/foo\.jpg/)
    assert.match(signedUrl!, /\/drive\/fakes\/signed\/avatars\/foo\.jpg/)
  })

  test('Precompute file url', async ({ assert, cleanup }) => {
    drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const attachmentManager = await app.container.make('jrmc.attachment')
    const attachment = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    attachment?.setOptions({ preComputeUrl: true, folder: 'avatars' })
    await attachmentManager.preComputeUrl(attachment!)

    assert.match(attachment?.url!, /\/drive\/fakes\/avatars\/foo\.jpg/)
  })
})
