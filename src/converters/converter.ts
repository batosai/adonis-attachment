/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Converter as ConverterInterface, ConverterOptions } from '../types/converter.js'
export default class Converter implements ConverterInterface {
  options?: ConverterOptions

  constructor(options?: ConverterOptions) {
    this.options = options
  }
}
