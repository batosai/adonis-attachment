/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { migrateLegacyAttachment } from '../index.js'
import { createAttachmentOwnerKey } from '../src/integrations/lucid/attachment_owner.js'

test.group('migrateLegacyAttachment', () => {
  test('converts an original attachment and its variants to polymorphic rows', ({ assert }) => {
    const ids = ['original-id', 'thumbnail-id']
    const rows = migrateLegacyAttachment(
      {
        name: 'avatar.jpg',
        originalName: 'profile.jpg',
        size: 42,
        extname: 'jpg',
        mimeType: 'image/jpeg',
        disk: 's3',
        path: 'users/42/avatar.jpg',
        meta: { width: 800 },
        variants: [
          {
            key: 'thumbnail',
            name: 'avatar.webp',
            size: 12,
            extname: 'webp',
            mimeType: 'image/webp',
            path: 'users/42/variants/avatar.webp',
          },
        ],
      },
      {
        owner: { type: 'users', id: '42', field: 'avatar' },
        defaultDisk: 'public',
        createId: () => ids.shift()!,
      }
    )

    assert.deepEqual(rows, [
      {
        id: 'original-id',
        attachableType: 'users',
        attachableId: '42',
        field: 'avatar',
        ownerKey: createAttachmentOwnerKey({ type: 'users', id: '42', field: 'avatar' }),
        parentId: null,
        variantKey: null,
        disk: 's3',
        path: 'users/42/avatar.jpg',
        name: 'avatar.jpg',
        originalName: 'profile.jpg',
        mimeType: 'image/jpeg',
        extname: 'jpg',
        size: 42,
        metadata: { width: 800 },
      },
      {
        id: 'thumbnail-id',
        attachableType: 'users',
        attachableId: '42',
        field: 'avatar',
        ownerKey: null,
        parentId: 'original-id',
        variantKey: 'thumbnail',
        disk: 'public',
        path: 'users/42/variants/avatar.webp',
        name: 'avatar.webp',
        originalName: 'profile.jpg',
        mimeType: 'image/webp',
        extname: 'webp',
        size: 12,
        metadata: null,
      },
    ])
  })

  test('accepts a serialized v5 document', ({ assert }) => {
    const rows = migrateLegacyAttachment(
      '{"name":"report.pdf","size":10,"extname":"pdf","mimeType":"application/pdf"}',
      {
        owner: { type: 'reports', id: 'report-id', field: 'document' },
        defaultDisk: 'public',
        createId: () => 'attachment-id',
      }
    )

    assert.equal(rows[0]?.disk, 'public')
    assert.equal(rows[0]?.originalName, 'report.pdf')
  })

  test('rejects malformed serialized documents', ({ assert }) => {
    assert.throws(
      () =>
        migrateLegacyAttachment('{not json}', {
          owner: { type: 'reports', id: 'report-id', field: 'document' },
          defaultDisk: 'public',
          createId: () => 'attachment-id',
        }),
      'Legacy attachment value must be valid JSON'
    )
  })
})
