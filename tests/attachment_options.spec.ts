import { test } from '@japa/runner'

import { resolveAttachmentPersistenceOptions } from '../index.js'

test.group('resolveAttachmentPersistenceOptions', () => {
  test('uses manager options over decorator and config defaults', ({ assert }) => {
    const resolved = resolveAttachmentPersistenceOptions(
      {
        disk: 'fs',
        folder: 'attachments',
        meta: true,
        variants: ['thumbnail'],
      },
      {
        disk: 's3',
        folder: 'avatars',
        preComputeUrl: true,
      },
      {
        folder: 'imports',
        variants: ['preview'],
      }
    )

    assert.deepEqual(resolved, {
      disk: 's3',
      folder: 'imports',
      meta: true,
      preComputeUrl: true,
      variants: ['preview'],
    })
  })

  test('allows an upper layer to clear an inherited option', ({ assert }) => {
    const resolved = resolveAttachmentPersistenceOptions(
      { disk: 'fs', variants: ['thumbnail'], preComputeUrl: true },
      { variants: null },
      { preComputeUrl: null }
    )

    assert.deepEqual(resolved, { disk: 'fs' })
  })
})
