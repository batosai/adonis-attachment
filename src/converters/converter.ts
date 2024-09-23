/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LoggerService } from '@adonisjs/core/types'
import type { BinPaths } from '../types/config.js'
import type { Converter as ConverterInterface, ConverterOptions } from '../types/converter.js'

import logger from '@adonisjs/core/services/logger'
export default class Converter implements ConverterInterface {
  options?: ConverterOptions
  binPaths?: BinPaths
  logger: LoggerService

  constructor(options?: ConverterOptions, binPaths?: BinPaths) {
    this.options = options
    this.binPaths = binPaths
    this.logger = logger
  }
}
