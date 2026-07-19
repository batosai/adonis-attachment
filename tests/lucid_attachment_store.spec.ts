/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { AttachmentModel } from '../src/integrations/lucid/attachment_model.js'
import { createAttachmentOwnerKey } from '../src/integrations/lucid/attachment_owner.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/lucid_attachment_store.js'

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

test.group('LucidAttachmentStore', () => {
  test('creates an original polymorphic attachment row', async ({ assert }) => {
    const created: Record<string, unknown>[] = []
    const store = new LucidAttachmentStore({
      async create(attributes: Record<string, unknown>) {
        created.push(attributes)
        return attributes
      },
    } as unknown as typeof AttachmentModel)

    await store.createOriginal({ type: 'users', id: '42', field: 'avatar' }, attachment)

    assert.deepEqual(created, [
      {
        ...attachment,
        attachableType: 'users',
        attachableId: '42',
        field: 'avatar',
        ownerKey: createAttachmentOwnerKey({ type: 'users', id: '42', field: 'avatar' }),
        parentId: null,
        variantKey: null,
        metadata: null,
      },
    ])
  })

  test('creates a variant linked to its original attachment', async ({ assert }) => {
    const created: Record<string, unknown>[] = []
    const store = new LucidAttachmentStore({
      async create(attributes: Record<string, unknown>) {
        created.push(attributes)
        return attributes
      },
    } as unknown as typeof AttachmentModel)
    const original = {
      id: 'original-id',
      attachableType: 'users',
      attachableId: '42',
      field: 'avatar',
    } as AttachmentModel

    await store.createVariant(original, 'thumbnail', { ...attachment, id: 'variant-id' })

    assert.deepEqual(created[0], {
      ...attachment,
      id: 'variant-id',
      attachableType: 'users',
      attachableId: '42',
      field: 'avatar',
      ownerKey: null,
      parentId: 'original-id',
      variantKey: 'thumbnail',
      metadata: null,
    })
  })
})
