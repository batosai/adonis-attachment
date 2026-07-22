/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import {
  createSharpBlurhashGenerator,
  isBlurhashEnabled,
  resolveBlurhashComponents,
} from '../src/media/blurhash.js'

test.group('Blurhash media adapter', () => {
  test('encodes raw alpha pixels with v5 default components', async ({ assert }) => {
    const calls: unknown[][] = []
    const generator = createSharpBlurhashGenerator(
      () => ({
        raw() {
          return this
        },
        ensureAlpha() {
          return this
        },
        async toBuffer() {
          return { data: new Uint8Array([1, 2, 3, 255]), info: { width: 1, height: 1 } }
        },
      }),
      (...input) => {
        calls.push(input)
        return 'LEHV6nWB2yk8pyo0adR*.7kCMdnj'
      }
    )

    const hash = await generator.generate({
      body: new Uint8Array([1, 2, 3]),
      ...resolveBlurhashComponents(true),
    })

    assert.equal(hash, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj')
    assert.deepEqual(calls, [[new Uint8ClampedArray([1, 2, 3, 255]), 1, 1, 4, 4]])
    assert.isTrue(isBlurhashEnabled(true))
    assert.isFalse(isBlurhashEnabled(false))
    assert.deepEqual(resolveBlurhashComponents({ enabled: true, componentX: 3, componentY: 5 }), {
      componentX: 3,
      componentY: 5,
    })
  })
})
