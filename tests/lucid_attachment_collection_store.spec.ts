import type { Database } from '@adonisjs/lucid/database'
import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/persistence/lucid_attachment_store.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'

const owner = { type: 'users', id: 'user-1', field: 'avatars' }
let database: Database

function makeAttachment(id: string): Attachment {
  return {
    id,
    disk: 'fs',
    path: `users/user-1/${id}.jpg`,
    name: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    extname: 'jpg',
    size: 42,
  }
}

test.group('Lucid attachment collection store', (group) => {
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

  test('inserts, orders, moves, and removes collection items', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const first = await store.createCollectionItem(owner, makeAttachment('first'))
    const third = await store.createCollectionItem(owner, makeAttachment('third'))
    const second = await store.createCollectionItem(owner, makeAttachment('second'), 1)

    assert.deepEqual(
      (await store.listCollection(owner)).map((item) => [item.attachmentId, item.position]),
      [
        ['first', 0],
        ['second', 1],
        ['third', 2],
      ]
    )
    assert.isNull(await store.findOriginal(owner))

    await store.moveCollectionItem(owner, third.id, 0)

    assert.deepEqual(
      (await store.listCollection(owner)).map((item) => [item.attachmentId, item.position]),
      [
        ['third', 0],
        ['first', 1],
        ['second', 2],
      ]
    )

    await store.removeCollectionItem(owner, first)

    assert.deepEqual(
      (await store.listCollection(owner)).map((item) => [item.attachmentId, item.position]),
      [
        ['third', 0],
        ['second', 1],
      ]
    )
  })

  test('serializes concurrent additions to an empty collection', async ({ assert }) => {
    await Promise.all(['first', 'second', 'third'].map((id) =>
      new LucidAttachmentStore().createCollectionItem(owner, makeAttachment(id))
    ))
    const items = await new LucidAttachmentStore().listCollection(owner)
    assert.deepEqual(items.map((item) => item.position), [0, 1, 2])
    assert.sameMembers(items.map((item) => item.attachmentId), ['first', 'second', 'third'])
  })

  test('rolls back shifted positions when link insertion fails, even if the caller commits', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const first = await store.createCollectionItem(owner, makeAttachment('first'))
    await store.createCollectionItem(owner, makeAttachment('second'))
    await database.transaction(async (client) => {
      const failing = new LucidAttachmentStore(undefined, { client, createLinkId: () => first.id })
      await assert.rejects(() => failing.createCollectionItem(owner, makeAttachment('failed'), 0), /UNIQUE/)
    })
    assert.deepEqual((await store.listCollection(owner)).map((item) => item.position), [0, 1])
    assert.isNull(await store.findById('failed'))
  })

  test('locks an explicitly supplied owner row and rejects a missing row', async ({ assert }) => {
    await database.connection().schema.createTable('collection_owners', (table) => table.string('key').primary())
    try {
      await database.table('collection_owners').insert({ key: 'owner-1' })
      const store = new LucidAttachmentStore()
      const lockedOwner = { ...owner, lock: { table: 'collection_owners', column: 'key', value: 'owner-1' } }
      await store.createCollectionItem(lockedOwner, makeAttachment('first'))
      await assert.rejects(() => store.createCollectionItem({ ...lockedOwner, lock: { ...lockedOwner.lock, value: 'missing' } }, makeAttachment('missing')), /lock row does not exist/)
      assert.isNull(await store.findById('missing'))
    } finally {
      await database.connection().schema.dropTable('collection_owners')
    }
  })
})
