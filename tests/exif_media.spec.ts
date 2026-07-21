/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import { createExifMetadataExtractor, type ExifReader } from '../src/media/exif.js'

const image: Attachment = {
  id: 'attachment-id',
  disk: 'fs',
  path: 'uploads/photo.jpg',
  name: 'photo.jpg',
  originalName: 'photo.jpg',
  mimeType: 'image/jpeg',
  extname: 'jpg',
  size: 3,
}

test.group('EXIF media adapter', () => {
  test('extracts the v5 image metadata shape', async ({ assert }) => {
    const reader: ExifReader = {
      async load() {
        return {
          exif: {
            DateTime: { description: '2010:01:15 18:51:34' },
            Software: { description: 'Adobe Photoshop' },
            PixelXDimension: { value: 346 },
            PixelYDimension: { value: 300 },
            Orientation: { value: 1, description: 'top-left' },
          },
          gps: {
            Latitude: { value: 48.862725 },
            Longitude: { value: 2.287592 },
            Altitude: { value: 35 },
          },
        }
      },
    }
    const extractor = createExifMetadataExtractor({ reader })

    assert.deepEqual(await extractor.extract({ attachment: image, body: new Uint8Array([1]) }), {
      date: '2010:01:15 18:51:34',
      host: 'Adobe Photoshop',
      dimension: { width: 346, height: 300 },
      orientation: { value: 1, description: 'top-left' },
      gps: { latitude: 48.862725, longitude: 2.287592, altitude: 35 },
    })
    assert.isFalse(await extractor.supports!({ attachment: { ...image, mimeType: 'application/pdf' } }))
  })
})
