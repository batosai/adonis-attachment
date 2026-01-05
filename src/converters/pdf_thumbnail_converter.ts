/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'
import type { Input } from '../types/input.js'

import Converter from './converter.js'
import ImageConverter from './image_converter.js'
import Poppler from '../adapters/poppler.js'
import { bufferToTempFile } from '../utils/helpers.js'

export default class PdfThumbnailConverter extends Converter {
  async handle({ input, options }: ConverterAttributes): Promise<Input> {
    const filePath = await this.pdfToImage(input)

    if (options && filePath) {
      const converter = new ImageConverter()
      return await converter.handle({
        input: filePath,
        options,
      })
    }

    return filePath
  }

  async pdfToImage(input: Input) {
    let file = input

    if (Buffer.isBuffer(input)) {
      file = await bufferToTempFile(input)
    }

    const poppler = new Poppler(file as string)

    if (this.binPaths) {
      if (this.binPaths.pdftoppmPath) {
        poppler.setPdfToPpmPath(this.binPaths.pdftoppmPath)
      }
    }

    return poppler.pdfToPpm({
      page: this.options?.startPage || 1,
      dpi: 300,
    })
  }
}
