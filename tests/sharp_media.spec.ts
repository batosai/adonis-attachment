/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import {
  createSharpMetadataExtractor,
  createSharpVariantConverter,
  type SharpFactory,
} from '../src/media/sharp.js'

const attachment: Attachment = {
  id: 'attachment-id',
  disk: 'fs',
  path: 'uploads/avatar.png',
  name: 'avatar.png',
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extname: 'png',
  size: 3,
}

test.group('Sharp media adapters', () => {
  test('extracts defined image metadata only', async ({ assert }) => {
    const extractor = createSharpMetadataExtractor((() => ({
      async metadata() {
        return { width: 800, height: 600, format: 'png', hasAlpha: true }
      },
      resize() {
        return this
      },
      toFormat() {
        return this
      },
      async toBuffer() {
        return new Uint8Array()
      },
    })) as SharpFactory)

    assert.isTrue(await extractor.supports!({ attachment }))
    assert.isFalse(await extractor.supports!({ attachment: { ...attachment, mimeType: 'application/pdf' } }))
    assert.deepEqual(
      await extractor.extract({ attachment, body: new Uint8Array([1, 2, 3]) }),
      { width: 800, height: 600, format: 'png', hasAlpha: true }
    )
  })

  test('creates formatted image variants', async ({ assert }) => {
    const operations: Array<readonly unknown[]> = []
    const converter = createSharpVariantConverter({
      key: 'thumbnail',
      sharp: (() => ({
        async metadata() {
          return {}
        },
        autoOrient() {
          operations.push(['autoOrient'])
          return this
        },
        resize(width, height, options) {
          operations.push(['resize', width, height, options])
          return this
        },
        toFormat(format, formatOptions) {
          operations.push(['format', format, formatOptions])
          return this
        },
        async toBuffer() {
          return new Uint8Array([4, 5])
        },
      })) as SharpFactory,
      width: 200,
      height: 120,
      resize: { fit: 'cover', background: '#ffffff', kernel: 'lanczos3' },
      format: { format: 'webp', options: { quality: 82, effort: 4 } },
      autoOrient: true,
      folder: 'variants',
    })

    const output = await converter.convert({ attachment, body: new Uint8Array([1, 2, 3]) })

    assert.deepEqual(operations, [
      ['autoOrient'],
      ['resize', 200, 120, { fit: 'cover', background: '#ffffff', kernel: 'lanczos3' }],
      ['format', 'webp', { quality: 82, effort: 4 }],
    ])
    assert.deepEqual(output, {
      body: new Uint8Array([4, 5]),
      fileName: 'thumbnail.webp',
      mimeType: 'image/webp',
      folder: 'variants',
    })
  })
})
