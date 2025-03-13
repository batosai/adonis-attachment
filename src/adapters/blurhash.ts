import { encode } from 'blurhash'

export default {
  async encode(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    componentX: number,
    componentY: number
  ): string {
    return encode(
      pixels,
      width,
      height,
      componentX,
      componentY
    )
  },
}