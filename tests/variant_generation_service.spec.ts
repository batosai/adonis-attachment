/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import type { Attachment, AttachmentPersistRequest } from '../src/core/attachment.js'
import { AttachmentService } from '../src/core/attachment_service.js'
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

  test('persists generated variants through metadata-aware drafts when requested', async ({ assert }) => {
    let requestedMeta: boolean | undefined
    const service = new VariantGenerationService({
      attachments: {
        async read() {
          return new Uint8Array([1])
        },
        async create() {
          assert.fail('Metadata-aware variants must use a draft')
          return sourceAttachment
        },
        createDraft() {
          return {
            async persist(request: AttachmentPersistRequest) {
              requestedMeta = request?.options?.meta ?? undefined
              return { ...sourceAttachment, id: 'thumbnail-id', name: 'thumbnail.png' }
            },
          } as never
        },
      },
      converters: [{
        key: 'thumbnail',
        async convert() {
          return { body: new Uint8Array([2]), fileName: 'thumbnail.png', mimeType: 'image/png' }
        },
      }],
    })

    await service.generateAll({ attachment: sourceAttachment, variantKeys: ['thumbnail'], meta: true })

    assert.isTrue(requestedMeta)
  })

  test('extracts metadata for generated variants through the attachment service', async ({ assert }) => {
    const writes: Uint8Array[] = []
    const attachments = new AttachmentService({
      storage: {
        async write(input) {
          writes.push(input.body)
        },
        async read() {
          return new Uint8Array([1])
        },
        async remove() {},
      },
      queue: { async enqueue() {} },
      defaultDisk: 'public',
      createId: () => 'thumbnail-id',
      metadataExtractors: [{
        async extract() {
          return { dimension: { width: 320, height: 180 } }
        },
      }],
    })
    const service = new VariantGenerationService({
      attachments,
      converters: [{
        key: 'thumbnail',
        async convert() {
          return { body: new Uint8Array([2]), fileName: 'thumbnail.png', mimeType: 'image/png' }
        },
      }],
    })

    const variants = await service.generateAll({ attachment: sourceAttachment, variantKeys: ['thumbnail'], meta: true })

    assert.deepEqual(variants[0]?.attachment.metadata, { dimension: { width: 320, height: 180 } })
    assert.deepEqual(writes, [new Uint8Array([2])])
  })

  test('stores a v5-style blurhash on a generated variant', async ({ assert }) => {
    const requests: Array<{ body: Uint8Array; componentX: number; componentY: number }> = []
    const service = new VariantGenerationService({
      attachments: {
        async read() {
          return new Uint8Array([1])
        },
        async create(input) {
          return {
            ...sourceAttachment,
            id: 'thumbnail-id',
            name: 'thumbnail.png',
            path: 'variants/thumbnail.png',
            ...(input.blurhash ? { blurhash: input.blurhash } : {}),
          }
        },
      },
      converters: [{
        key: 'thumbnail',
        blurhash: { enabled: true, componentX: 3, componentY: 5 },
        async convert() {
          return { body: new Uint8Array([2]), fileName: 'thumbnail.png', mimeType: 'image/png' }
        },
      }],
      blurhash: {
        async generate(input) {
          requests.push(input)
          return 'LEHV6nWB2yk8pyo0adR*.7kCMdnj'
        },
      },
    })

    const variants = await service.generateAll({ attachment: sourceAttachment, variantKeys: ['thumbnail'] })

    assert.equal(variants[0]?.attachment.blurhash, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj')
    assert.deepEqual(requests, [{ body: new Uint8Array([2]), componentX: 3, componentY: 5 }])
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
