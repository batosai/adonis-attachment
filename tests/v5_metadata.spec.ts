/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { createV5CompatibleMetadataExtractors } from '../src/media/v5_metadata.js'

test.group('v5-compatible metadata profile', () => {
  test('registers every v5 metadata source by default', ({ assert }) => {
    const extractors = createV5CompatibleMetadataExtractors()

    assert.lengthOf(extractors, 3)
  })

  test('allows individual metadata sources to be disabled', ({ assert }) => {
    const extractors = createV5CompatibleMetadataExtractors({ exif: false, pdfinfo: false })

    assert.lengthOf(extractors, 1)
  })
})
