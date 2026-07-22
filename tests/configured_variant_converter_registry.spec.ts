/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import Converter from '../src/converters/converter.js'
import { ConfiguredVariantConverterRegistry } from '../src/converters/configured_variant_converter_registry.js'
import type { Attachment } from '../src/core/attachment.js'

const attachment: Attachment = {
  id: 'attachment-id',
  disk: 'fs',
  path: 'uploads/avatar.jpg',
  name: 'avatar.jpg',
  originalName: 'avatar.jpg',
  mimeType: 'image/jpeg',
  extname: 'jpg',
  size: 3,
}

class ThumbnailConverter extends Converter {
  async handle({ body, options }: Parameters<Converter['handle']>[0]) {
    return {
      body,
      fileName: `thumbnail-${String(options.width)}.webp`,
      mimeType: 'image/webp',
    }
  }
}

test.group('ConfiguredVariantConverterRegistry', () => {
  test('loads a v5-style converter once and passes its direct options', async ({ assert }) => {
    let imports = 0
    const registry = new ConfiguredVariantConverterRegistry({
      thumbnail: {
        width: 320,
        blurhash: true,
        converter: async () => {
          imports += 1
          return { default: ThumbnailConverter }
        },
      },
    })

    const [first, second] = await Promise.all([registry.get('thumbnail'), registry.get('thumbnail')])
    const output = await first?.convert({ attachment, body: new Uint8Array([1, 2, 3]) })

    assert.equal(first, second)
    assert.equal(imports, 1)
    assert.deepEqual(await registry.keys(), ['thumbnail'])
    assert.isTrue(first?.blurhash === true)
    assert.deepEqual(output, {
      body: new Uint8Array([1, 2, 3]),
      fileName: 'thumbnail-320.webp',
      mimeType: 'image/webp',
    })
  })

  test('accepts a direct VariantConverter export and uses the configured key', async ({ assert }) => {
    const registry = new ConfiguredVariantConverterRegistry({
      preview: {
        converter: async () => ({
          default: {
            key: 'ignored',
            async convert() {
              return undefined
            },
          },
        }),
      },
    })

    const converter = await registry.get('preview')

    assert.equal(converter?.key, 'preview')
    assert.isUndefined(await converter?.convert({ attachment, body: new Uint8Array() }))
    assert.isUndefined(await registry.get('missing'))
  })
})
