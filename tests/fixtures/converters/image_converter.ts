/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../../../src/types/converter.js'
import type { Input } from '../../../src/types/input.js'

import Converter from '../../../src/converters/converter.js'

export default class ImageConverter extends Converter {
  async handle({ input }: ConverterAttributes): Promise<Input> {
    return input
  }
}
