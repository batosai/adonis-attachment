/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Database } from '@adonisjs/lucid/database'
import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import { AttachmentLinkModel } from '../src/integrations/lucid/models/attachment_link_model.js'
import { AttachmentModel } from '../src/integrations/lucid/models/attachment_model.js'
import { LucidAttachmentLifecycleService } from '../src/integrations/lucid/persistence/lucid_attachment_lifecycle_service.js'
import { LucidAttachmentRepository } from '../src/integrations/lucid/persistence/lucid_attachment_repository.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/persistence/lucid_attachment_store.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'

const owner = { type: 'users', id: '42', field: 'avatar' }
let database: Database

function makeAttachment(id: string, path: string, metadata?: Record<string, unknown>): Attachment {
  return {
    id,
    disk: 'public',
    path,
    name: path.split('/').at(-1)!,
    originalName: 'profile.jpg',
    mimeType: 'image/jpeg',
    extname: 'jpg',
    size: 42,
    ...(metadata ? { metadata } : {}),
  }
}

test.group('Lucid SQLite integration', (group) => {
  group.setup(async () => {
    database = await createLucidTestDatabase()
  })

  group.each.setup(async () => {
    await database.from('attachment_links').delete()
    await database.from('attachments').delete()
  })

  group.teardown(async () => {
    await database.manager.closeAll()
  })

  test('persists original rows and variants using the generated table schema', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const original = await store.createOriginal(
      owner,
      makeAttachment('original-id', 'users/42/avatar.jpg', { width: 800 })
    )
    const variant = await store.createVariant(
      original.attachment,
      'thumbnail',
      { ...makeAttachment('variant-id', 'users/42/thumbnail.jpg'), blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }
    )

    const reloaded = await AttachmentModel.findOrFail(original.attachmentId)
    const link = await AttachmentLinkModel.findOrFail(original.id)
    const persisted = await store.findByOwner(owner)

    assert.equal(link.attachableType, 'users')
    assert.equal(link.attachableId, '42')
    assert.equal(link.field, 'avatar')
    assert.deepEqual(reloaded.metadata, { width: 800 })
    assert.isNotNull(reloaded.createdAt)
    assert.isNotNull(reloaded.updatedAt)
    assert.equal(variant.parentId, original.attachmentId)
    assert.equal(variant.variantKey, 'thumbnail')
    assert.equal(variant.toAttachment().blurhash, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj')
    assert.equal(persisted?.original.id, original.id)
    assert.deepEqual(persisted?.variants.map((row) => row.id), ['variant-id'])
  })

  test('returns null when no attachment exists for the owner field', async ({ assert }) => {
    const result = await new LucidAttachmentStore().findByOwner(owner)

    assert.isNull(result)
  })

  test('prevents two original attachments for the same owner field', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    await store.createOriginal(owner, makeAttachment('first-id', 'users/42/first.jpg'))

    await assert.rejects(
      () => store.createOriginal(owner, makeAttachment('second-id', 'users/42/second.jpg')),
      /UNIQUE constraint failed/
    )
  })

  test('prevents duplicate variant keys for the same original', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const original = await store.createOriginal(owner, makeAttachment('original-id', 'users/42/avatar.jpg'))
    await store.createVariant(
      original.attachment,
      'thumbnail',
      makeAttachment('first-variant-id', 'users/42/thumbnail.jpg')
    )

    await assert.rejects(
      () =>
        store.createVariant(
          original.attachment,
          'thumbnail',
          makeAttachment('second-variant-id', 'users/42/thumbnail-2.jpg')
        ),
      /UNIQUE constraint failed/
    )
  })

  test('uses persisted rows for lifecycle replacement, deletion, and repository reads', async ({ assert }) => {
    const removed: string[] = []
    const attachments = [
      makeAttachment('first-id', 'users/42/first.jpg'),
      makeAttachment('second-id', 'users/42/second.jpg'),
    ]
    const lifecycle = new LucidAttachmentLifecycleService(
      {
        async create() {
          return attachments.shift()!
        },
        async remove(attachment) {
          removed.push(attachment.id)
        },
      },
      new LucidAttachmentStore()
    )

    const first = await lifecycle.attach(owner, {
      body: new Uint8Array(),
      originalName: 'profile.jpg',
    })
    const replacement = await lifecycle.replace(owner, {
      body: new Uint8Array(),
      originalName: 'profile.jpg',
    })
    await new LucidAttachmentStore().createVariant(
      replacement.attachment,
      'thumbnail',
      makeAttachment('variant-id', 'users/42/thumbnail.jpg')
    )

    const repository = new LucidAttachmentRepository()
    assert.equal((await repository.findById(replacement.attachmentId))?.path, 'users/42/second.jpg')
    assert.isNull(await AttachmentLinkModel.find(first.id))
    assert.isNull(await AttachmentModel.find(first.attachmentId))
    assert.deepEqual(removed, [first.attachmentId])

    await lifecycle.detach(owner)

    assert.isNull(await AttachmentLinkModel.find(replacement.id))
    assert.isNull(await AttachmentModel.find(replacement.attachmentId))
    assert.isNull(await AttachmentModel.find('variant-id'))
    assert.sameDeepMembers(removed, [first.attachmentId, replacement.attachmentId, 'variant-id'])
  })
})
