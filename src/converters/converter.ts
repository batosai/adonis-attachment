/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { BinPaths } from '../types/config.js'
import type { Converter as ConverterInterface, ConverterOptions, ConverterAttributes } from '../types/converter.js'
import type { Input } from '../types/input.js'

export default class Converter implements ConverterInterface {
  options?: ConverterOptions
  binPaths?: BinPaths

  constructor(options?: ConverterOptions, binPaths?: BinPaths) {
    this.options = options
    this.binPaths = binPaths
  }

  async handle({ input }: ConverterAttributes): Promise<Input | undefined> {
    return input
  }
}
