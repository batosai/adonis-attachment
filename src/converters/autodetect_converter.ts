/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ConverterAttributes } from '../types/converter.js'
import type { Input } from '../types/input.js'

import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type'
import Converter from './converter.js'
import ImageConverter from './image_converter.js'
import VideoThumnailConverter from './video_thumbnail_converter.js'
import DocumentThumbnailConverter from './document_thumbnail_converter.js'
import PdfThumbnailConverter from './pdf_thumbnail_converter.js'

export default class AutodetectConverter extends Converter {
  async handle({ input, options }: ConverterAttributes): Promise<Input | undefined> {
    let converter
    let fileType

    if (Buffer.isBuffer(input)) {
      fileType = await fileTypeFromBuffer(input)
    } else {
      fileType = await fileTypeFromFile(input)
    }

    if (!fileType) {
      fileType = {
        mime: 'text/plain',
      }
    }

    if (fileType?.mime.includes('image')) {
      converter = new ImageConverter(options, this.binPaths)
    } else if (fileType?.mime.includes('video')) {
      converter = new VideoThumnailConverter(options, this.binPaths)
    } else if (fileType?.mime.includes('pdf')) {
      converter = new PdfThumbnailConverter(options, this.binPaths)
    } else if (
      // Documents texte
      fileType?.mime.includes(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) || // .docx
      fileType?.mime.includes('application/vnd.oasis.opendocument.text') || // .odt
      fileType?.mime.includes('application/msword') || // .doc
      fileType?.mime.includes('application/rtf') || // .rtf
      fileType?.mime.includes('text/plain') || // .txt
      fileType?.mime.includes('application/xml') || // .xml, .svg
      // Feuilles de calcul
      fileType?.mime.includes('application/vnd.oasis.opendocument.spreadsheet') || // .ods
      fileType?.mime.includes('application/vnd.ms-excel') || // .xls
      fileType?.mime.includes(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) || // .xlsx
      fileType?.mime.includes('text/csv') || // .csv
      // Présentations
      fileType?.mime.includes('application/vnd.oasis.opendocument.presentation') || // .odp
      fileType?.mime.includes('application/vnd.ms-powerpoint') || // .ppt
      fileType?.mime.includes(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ) || // .pptx
      // Dessins
      fileType?.mime.includes('application/vnd.oasis.opendocument.graphics') || // .odg
      fileType?.mime.includes('application/vnd.visio') || // .vsd
      // Formules mathématiques
      fileType?.mime.includes('application/vnd.oasis.opendocument.formula') || // .odf
      fileType?.mime.includes('application/mathml+xml') || // .mml
      // Bases de données
      fileType?.mime.includes('application/vnd.oasis.opendocument.database') || // .odb
      fileType?.mime.includes('application/x-msaccess') || // .mdb, .accdb
      // Autres formats Office
      fileType?.mime.includes('application/vnd.ms-office') || // Formats MS Office génériques
      fileType?.mime.includes('application/vnd.oasis.opendocument') // Formats OpenDocument génériques
    ) {
      converter = new DocumentThumbnailConverter(options, this.binPaths)
    } else {
      return
    }

    return converter.handle({
      input,
      options,
    })
  }
}
