/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import type { AttachmentModel } from '../src/integrations/lucid/models/attachment_model.js'
import {
  LucidVariantGenerationService,
  PersistedAttachmentNotFoundError,
} from '../src/integrations/lucid/persistence/lucid_variant_generation_service.js'

const original: Attachment = {
  id: 'original-id', disk: 'public', path: 'users/42/avatar.jpg', name: 'avatar.jpg',
  originalName: 'profile.jpg', mimeType: 'image/jpeg', extname: 'jpg', size: 42,
}
const variant: Attachment = { ...original, id: 'variant-id', name: 'thumbnail.webp', extname: 'webp' }

test.group('LucidVariantGenerationService', () => {
  test('persists generated variants under their original attachment', async ({ assert }) => {
    const persisted: string[] = []
    const service = new LucidVariantGenerationService({
      generator: { async generateAll() { return [{ key: 'thumbnail', attachment: variant }] } },
      attachments: { async remove() {} },
      store: {
        async findById() { return { id: original.id } as AttachmentModel },
        async createVariant(row, key, attachment) {
          persisted.push(`${row.id}:${key}:${attachment.id}`)
          return {} as AttachmentModel
        },
      },
    })
    await service.generate({ attachment: original })
    assert.deepEqual(persisted, ['original-id:thumbnail:variant-id'])
  })

  test('removes a generated file when variant persistence fails', async ({ assert }) => {
    const removed: string[] = []
    const service = new LucidVariantGenerationService({
      generator: { async generateAll() { return [{ key: 'thumbnail', attachment: variant }] } },
      attachments: { async remove(attachment) { removed.push(attachment.id) } },
      store: {
        async findById() { return { id: original.id } as AttachmentModel },
        async createVariant() { throw new Error('database unavailable') },
      },
    })
    await assert.rejects(() => service.generate({ attachment: original }), 'database unavailable')
    assert.deepEqual(removed, ['variant-id'])
  })

  test('fails when the original is no longer persisted', async ({ assert }) => {
    const service = new LucidVariantGenerationService({
      generator: { async generateAll() { return [] } },
      attachments: { async remove() {} },
      store: {
        async findById() { return null },
        async createVariant() { return {} as AttachmentModel },
      },
    })
    await assert.rejects(() => service.generate({ attachment: original }), PersistedAttachmentNotFoundError)
  })
})
