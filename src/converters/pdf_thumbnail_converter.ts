/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'
import type { Input } from '../types/input.js'

import os from 'node:os'
import path from 'node:path'
import { cuid } from '@adonisjs/core/helpers'
import Converter from './converter.js'
import ImageConverter from './image_converter.js'
import { use } from '../utils/helpers.js'

export default class PdfThumbnailConverter extends Converter {
  async handle({ input, options }: ConverterAttributes): Promise<Input> {
    const nodePoppler = await use('node-poppler')
    const Poppler = nodePoppler.Poppler
    const filePath = await this.pdfToImage(Poppler, input)

    if (options && filePath) {
      const converter = new ImageConverter()
      return await converter.handle({
        input: filePath,
        options,
      })
    }

    return filePath
  }

  async pdfToImage(Poppler: any, input: Input) {
    let binPath = null

    if (this.binPaths && this.binPaths.pdftocairoBasePath) {
      binPath = this.binPaths.pdftocairoBasePath
    }

    const poppler = new Poppler(binPath)

    const pdfInfo = await poppler.pdfInfo(input)
    const pagesMatch = pdfInfo.match(/Pages:\s*(\d+)/)
    const pageCount = pagesMatch ? parseInt(pagesMatch[1]) : 1

    const pageNumberFormat = '0'.repeat(String(pageCount).length - 1)

    const options = {
      // firstPageToConvert: 1,
      lastPageToConvert: 1,
      jpegFile: true,
    }
    const filePath = path.join(os.tmpdir(), cuid())

    await poppler.pdfToCairo(input, filePath, options)

    return `${filePath}-${pageNumberFormat}1.jpg`
  }
}
