/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import { LucidAttachmentMetadataPersister } from '../src/integrations/lucid/persistence/lucid_attachment_metadata_persister.js'

const attachment: Attachment = {
  id: 'attachment-id', disk: 'public', path: 'avatar.jpg', name: 'avatar.jpg',
  originalName: 'avatar.jpg', mimeType: 'image/jpeg', extname: 'jpg', size: 3,
}

test.group('LucidAttachmentMetadataPersister', () => {
  test('updates the metadata JSON column for the stored blob', async ({ assert }) => {
    const updates: Array<{ id: string; metadata: unknown }> = []
    const model = {
      query() {
        return {
          where(_: string, id: string) {
            return {
              async update({ metadata }: { metadata: unknown }) {
                updates.push({ id, metadata })
              },
            }
          },
        }
      },
    } as never
    const persister = new LucidAttachmentMetadataPersister(model)

    await persister.persistMetadata(attachment, { dimension: { width: 320, height: 180 } })

    assert.deepEqual(updates, [{ id: 'attachment-id', metadata: { dimension: { width: 320, height: 180 } } }])
  })
})
