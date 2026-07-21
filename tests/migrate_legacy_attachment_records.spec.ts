/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { migrateLegacyAttachmentRecords, type MigratedAttachmentRows } from '../src/integrations/lucid/index.js'

test.group('migrateLegacyAttachmentRecords', () => {
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
