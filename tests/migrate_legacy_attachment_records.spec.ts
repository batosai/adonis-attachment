/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { migrateLegacyAttachmentRecords, type MigratedAttachmentRows } from '../src/integrations/lucid/index.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'
import { AttachmentModel, AttachmentLinkModel, LucidAttachmentStore } from '../src/integrations/lucid/index.js'

test.group('migrateLegacyAttachmentRecords', () => {
  test('migrates arrays and individual collection items to ordered readable links', async ({ assert }) => {
    const database = await createLucidTestDatabase()
    const owner = { type: 'users', id: '1', field: 'gallery' }
    const first = { name: 'first.jpg', size: 10, extname: 'jpg', mimeType: 'image/jpeg', variants: [
      { key: 'thumbnail', name: 'thumb.webp', size: 2, extname: 'webp', mimeType: 'image/webp' },
    ] }
    const second = { name: 'second.jpg', size: 20, extname: 'jpg', mimeType: 'image/jpeg' }
    let id = 0
    try {
      const result = await migrateLegacyAttachmentRecords({
        records: [
          { owner, value: JSON.stringify([first, second]) },
          { owner, value: { ...second, name: 'third.jpg' }, kind: 'many', position: 2 },
          { owner: { ...owner, field: 'empty' }, value: [] },
          { owner: { ...owner, field: 'avatar' }, value: second },
        ],
        defaultDisk: 'public', createId: () => `migration-${++id}`, batchSize: 1,
        writer: { async insert(rows) {
          await database.transaction(async (trx) => {
            await AttachmentModel.createMany(rows.blobs, { client: trx })
            await AttachmentLinkModel.createMany(rows.links, { client: trx })
          })
        } },
      })
      const store = new LucidAttachmentStore()
      const collection = await store.listCollection(owner)
      assert.deepEqual(collection.map((item) => [item.toAttachment().name, item.ownerKey, item.position]), [
        ['first.jpg', null, 0], ['second.jpg', null, 1], ['third.jpg', null, 2],
      ])
      assert.equal((await store.listVariants(collection[0]!.attachmentId))[0]?.variantKey, 'thumbnail')
      assert.isNotNull(await store.findOriginal({ ...owner, field: 'avatar' }))
      assert.deepEqual(result, { attachments: 4, variants: 1, skipped: 1 })
    } finally {
      await database.manager.closeAll()
    }
  })

  test('migrates values in batches and reports skipped records', async ({ assert }) => {
    const ids = ['original-1', 'variant-1', 'link-1', 'original-2', 'link-2']
    const batches: MigratedAttachmentRows[] = []
    const result = await migrateLegacyAttachmentRecords({
      records: [
        {
          owner: { type: 'users', id: '1', field: 'avatar' },
          value: {
            name: 'avatar.jpg',
            size: 10,
            extname: 'jpg',
            mimeType: 'image/jpeg',
            variants: [
              {
                key: 'thumbnail',
                name: 'avatar.webp',
                size: 5,
                extname: 'webp',
                mimeType: 'image/webp',
              },
            ],
          },
        },
        { owner: { type: 'users', id: '2', field: 'avatar' }, value: null },
        {
          owner: { type: 'users', id: '3', field: 'avatar' },
          value: {
            name: 'avatar.png',
            size: 12,
            extname: 'png',
            mimeType: 'image/png',
          },
        },
      ],
      defaultDisk: 'public',
      createId: () => ids.shift()!,
      batchSize: 2,
      writer: {
        async insert(rows) {
          batches.push(rows)
        },
      },
    })

    assert.deepEqual(result, { attachments: 2, variants: 1, skipped: 1 })
    assert.deepEqual(
      batches.map((batch) => batch.blobs.map((row) => row.id)),
      [['original-1', 'variant-1'], ['original-2']]
    )
    assert.deepEqual(
      batches.map((batch) => batch.links.map((row) => [row.id, row.attachmentId])),
      [[['link-1', 'original-1']], [['link-2', 'original-2']]]
    )
  })

  test('rejects an invalid batch size before processing records', async ({ assert }) => {
    await assert.rejects(
      () =>
        migrateLegacyAttachmentRecords({
          records: [],
          defaultDisk: 'public',
          createId: () => 'attachment-id',
          batchSize: 0,
          writer: { async insert() {} },
        }),
      'Legacy attachment migration batchSize must be a positive integer'
    )
  })
})
