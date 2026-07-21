/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { LucidAttachmentRepository } from '../src/integrations/lucid/persistence/lucid_attachment_repository.js'
import { AttachmentModel } from '../src/integrations/lucid/models/attachment_model.js'

test.group('LucidAttachmentRepository', () => {
  test('maps the configured Lucid model to a core attachment', async ({ assert }) => {
    const repository = new LucidAttachmentRepository({
      async find(id: string) {
        assert.equal(id, 'attachment-id')
        return {
          toAttachment() {
            return {
              id,
              disk: 'public',
              path: 'users/42/avatar.jpg',
              name: 'avatar.jpg',
              originalName: 'profile.jpg',
              mimeType: 'image/jpeg',
              extname: 'jpg',
              size: 42,
            }
          },
        }
      },
    } as unknown as typeof AttachmentModel)

    assert.deepEqual(await repository.findById('attachment-id'), {
      id: 'attachment-id',
      disk: 'public',
      path: 'users/42/avatar.jpg',
      name: 'avatar.jpg',
      originalName: 'profile.jpg',
      mimeType: 'image/jpeg',
      extname: 'jpg',
      size: 42,
    })
  })

  test('returns null when the attachment cannot be found', async ({ assert }) => {
    const repository = new LucidAttachmentRepository({
      async find() {
        return null
      },
    } as unknown as typeof AttachmentModel)

    assert.isNull(await repository.findById('missing'))
  })
})
