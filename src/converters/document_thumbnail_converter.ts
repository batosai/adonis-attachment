/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'
import type { Input } from '../types/input.js'

import { readFile } from 'fs/promises'
import Converter from './converter.js'
import ImageConverter from './image_converter.js'
import { use } from '../utils/helpers.js'

export default class DocumentThumbnailConverter extends Converter {
  async handle({ input, options }: ConverterAttributes) {
    const lib = await use('libreoffice-file-converter')

    if (lib) {
      const LibreOfficeFileConverter = lib.LibreOfficeFileConverter

      const outputBuffer = await this.documentToImage(LibreOfficeFileConverter, input)

      if (options && outputBuffer) {
        const converter = new ImageConverter()
        return await converter.handle({
          input: outputBuffer,
          options
        })
      }

      return outputBuffer
    }
  }

  async documentToImage(LibreOfficeFileConverter: any, input: Input) {
    let binaryPaths = undefined
    if (this.binPaths && this.binPaths.libreofficePaths) {
      binaryPaths = this.binPaths.libreofficePaths
    }

    const libreOfficeFileConverter = new LibreOfficeFileConverter({
      childProcessOptions: {
        timeout: 60 * 1000,
      },
      binaryPaths
    })

    const inputBuffer = await readFile(input)

    const outputBuffer = await libreOfficeFileConverter.convert({
      buffer: inputBuffer,
      format: 'jpeg',
      input: 'buffer',
      output: 'buffer',
    })

    return outputBuffer
  }
}
