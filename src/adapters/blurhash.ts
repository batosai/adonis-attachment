/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { encode } from 'blurhash'

export default {
  async encode(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    componentX: number,
    componentY: number
  ): Promise<string> {
    return encode(pixels, width, height, componentX, componentY)
  },
}
