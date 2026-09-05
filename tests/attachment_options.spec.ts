import { test } from '@japa/runner'

import { resolveAttachmentPersistenceOptions } from '../index.js'

test.group('resolveAttachmentPersistenceOptions', () => {
  test('uses manager options over decorator and config defaults', ({ assert }) => {
    const resolved = resolveAttachmentPersistenceOptions(
      {
        disk: 'fs',
        folder: 'attachments',
        normalizeFileName: true,
        meta: true,
        variants: ['thumbnail'],
      },
      {
        disk: 's3',
        folder: 'avatars',
        normalizeFileName: false,
        preComputeUrl: true,
      },
      {
        folder: 'imports',
        normalizeFileName: true,
        variants: ['preview'],
      }
    )

    assert.deepEqual(resolved, {
      disk: 's3',
      folder: 'imports',
      normalizeFileName: true,
      meta: true,
      preComputeUrl: true,
      variants: ['preview'],
    })
  })

  test('allows an upper layer to clear an inherited option', ({ assert }) => {
    const resolved = resolveAttachmentPersistenceOptions(
      { disk: 'fs', variants: ['thumbnail'], preComputeUrl: true, normalizeFileName: true },
      { variants: null },
      { preComputeUrl: null, normalizeFileName: false }
    )

    assert.deepEqual(resolved, { disk: 'fs', normalizeFileName: false })
  })
})
