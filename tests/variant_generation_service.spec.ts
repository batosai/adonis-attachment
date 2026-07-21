/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import { UnknownVariantConverterError, VariantGenerationService } from '../index.js'

const sourceAttachment: Attachment = {
  id: 'original-id',
  disk: 'public',
  path: 'users/42/avatar.jpg',
  name: 'avatar.jpg',
  originalName: 'profile.jpg',
  mimeType: 'image/jpeg',
  extname: 'jpg',
  size: 42,
}

test.group('VariantGenerationService', () => {
  test('converts and writes selected variants', async ({ assert }) => {
    const generated: Attachment[] = []
    const service = new VariantGenerationService({
      attachments: {
        async read() {
          return new Uint8Array([1, 2, 3])
        },
        async create(input) {
          const attachment = {
            ...sourceAttachment,
            id: 'thumbnail-id',
            name: 'thumbnail.webp',
            path: 'users/42/variants/thumbnail.webp',
            originalName: input.originalName,
            mimeType: input.mimeType ?? 'application/octet-stream',
            extname: 'webp',
            size: input.body.byteLength,
          }
          generated.push(attachment)
          return attachment
        },
      },
      converters: [
        {
          key: 'thumbnail',
          async convert(input) {
            assert.deepEqual(input.body, new Uint8Array([1, 2, 3]))
            return {
              body: new Uint8Array([4, 5]),
              fileName: 'thumbnail.webp',
              mimeType: 'image/webp',
              folder: 'users/42/variants',
            }
          },
        },
      ],
    })

    const variants = await service.generateAll({
      attachment: sourceAttachment,
      variantKeys: ['thumbnail'],
    })

    assert.deepEqual(variants.map((variant) => variant.key), ['thumbnail'])
    assert.equal(generated[0]?.mimeType, 'image/webp')
  })

  test('fails when a requested converter does not exist', async ({ assert }) => {
    const service = new VariantGenerationService({
      attachments: {
        async read() {
          return new Uint8Array()
        },
        async create() {
          return sourceAttachment
        },
      },
      converters: [],
    })

    await assert.rejects(
      () => service.generateAll({ attachment: sourceAttachment, variantKeys: ['thumbnail'] }),
      UnknownVariantConverterError
    )
  })

  test('ignores a converter that intentionally returns no variant', async ({ assert }) => {
    const service = new VariantGenerationService({
      attachments: {
        async read() {
          return new Uint8Array()
        },
        async create() {
          assert.fail('No file should be written')
          return sourceAttachment
        },
      },
      converters: [
        {
          key: 'thumbnail',
          async convert() {
            return undefined
          },
        },
      ],
    })

    assert.deepEqual(
      await service.generateAll({ attachment: sourceAttachment, variantKeys: ['thumbnail'] }),
      []
    )
  })
})
