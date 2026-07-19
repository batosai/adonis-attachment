/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Database } from '@adonisjs/lucid/database'
import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import { AttachmentModel } from '../src/integrations/lucid/attachment_model.js'
import { LucidAttachmentLifecycleService } from '../src/integrations/lucid/lucid_attachment_lifecycle_service.js'
import { LucidAttachmentRepository } from '../src/integrations/lucid/lucid_attachment_repository.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/lucid_attachment_store.js'
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
      original,
      'thumbnail',
      makeAttachment('variant-id', 'users/42/thumbnail.jpg')
    )

    const reloaded = await AttachmentModel.findOrFail(original.id)
    const persisted = await store.findByOwner(owner)

    assert.equal(reloaded.attachableType, 'users')
    assert.equal(reloaded.attachableId, '42')
    assert.equal(reloaded.field, 'avatar')
    assert.deepEqual(reloaded.metadata, { width: 800 })
    assert.isNotNull(reloaded.createdAt)
    assert.isNotNull(reloaded.updatedAt)
    assert.equal(variant.parentId, original.id)
    assert.equal(variant.variantKey, 'thumbnail')
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
      original,
      'thumbnail',
      makeAttachment('first-variant-id', 'users/42/thumbnail.jpg')
    )

    await assert.rejects(
      () =>
        store.createVariant(
          original,
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
      replacement,
      'thumbnail',
      makeAttachment('variant-id', 'users/42/thumbnail.jpg')
    )

    const repository = new LucidAttachmentRepository()
    assert.equal((await repository.findById(replacement.id))?.path, 'users/42/second.jpg')
    assert.isNull(await AttachmentModel.find(first.id))
    assert.deepEqual(removed, [first.id])

    await lifecycle.detach(owner)

    assert.isNull(await AttachmentModel.find(replacement.id))
    assert.isNull(await AttachmentModel.find('variant-id'))
    assert.sameDeepMembers(removed, [first.id, replacement.id, 'variant-id'])
  })
})
