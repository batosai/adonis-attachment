/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'
import type { Input } from '../types/input.js'

import { bufferToTempFile } from '../utils/helpers.js'
import Converter from './converter.js'
import ImageConverter from './image_converter.js'
import Soffice from '../adapters/soffice.js'

export default class DocumentThumbnailConverter extends Converter {
  async handle({ input, options }: ConverterAttributes): Promise<Input> {
    const filePath = await this.documentToImage(input)

    if (options && filePath) {
      const converter = new ImageConverter()
      return await converter.handle({
        input: filePath,
        options,
      })
    }

    return filePath
  }

  async documentToImage(input: Input) {
    let file = input

    if (Buffer.isBuffer(input)) {
      file = await bufferToTempFile(input)
    }

    const soffice = new Soffice(file as string)

    if (this.binPaths) {
      if (this.binPaths.sofficePath) {
        soffice.setSofficePath(this.binPaths.sofficePath)
      }
    }

    return soffice.convert()
  }
}