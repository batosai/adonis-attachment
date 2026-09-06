/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Database } from '@adonisjs/lucid/database'
import { test } from '@japa/runner'

import { AttachmentLinkModel } from '../src/integrations/lucid/models/attachment_link_model.js'
import { AttachmentModel } from '../src/integrations/lucid/models/attachment_model.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/persistence/lucid_attachment_store.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'

const attachment = {
  id: 'attachment-id',
  disk: 'public',
  path: 'users/42/avatar.jpg',
  name: 'avatar.jpg',
  originalName: 'profile.jpg',
  mimeType: 'image/jpeg',
  extname: 'jpg',
  size: 42,
} as const

let database: Database

test.group('LucidAttachmentStore', (group) => {
  group.setup(async () => {
    database = await createLucidTestDatabase()
  })

  group.each.setup(async () => {
    await database.from('adonis_attachment_links').delete()
    await database.from('adonis_attachments').delete()
  })

  group.teardown(async () => {
    await database.manager.closeAll()
  })

  test('stores a blob separately from its singular polymorphic link', async ({ assert }) => {
    const original = await new LucidAttachmentStore().createOriginal(
      { type: 'users', id: '42', field: 'avatar' },
      attachment
    )

    const blob = await AttachmentModel.findOrFail(attachment.id)
    const link = await AttachmentLinkModel.findOrFail(original.id)

    assert.equal(link.attachmentId, blob.id)
    assert.equal(link.attachableType, 'users')
    assert.equal(link.attachableId, '42')
    assert.equal(link.field, 'avatar')
    assert.equal(original.toAttachment().path, attachment.path)
  })
})
