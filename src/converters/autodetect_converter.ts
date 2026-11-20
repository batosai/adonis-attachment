/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import Converter, { type ConverterAttributes, type ConverterOptions, type SharpFormat } from './converter.js'
import {
  createDocumentThumbnailConverter,
  createFfmpegThumbnailConverter,
  createPdfThumbnailConverter,
  type CommandRunner,
} from '../media/binaries.js'
import { renderSharpVariantFromFile, type SharpImage, type SharpResizeOptions } from '../media/sharp.js'
import { MissingOptionalDependencyError } from '../errors.js'
import { loadOptionalDependency } from '../utils/optional_dependency.js'

export type AutodetectConverterOptions = ConverterOptions & {
  runner?: CommandRunner
  ffmpegCommand?: string
  ffmpegTimeout?: number
  pdftoppmCommand?: string
  pdftoppmTimeout?: number
  officeCommand?: string
  officeTimeout?: number
  timeout?: number
}

/**
 * Default v5-compatible converter selected when a configured key has no
 * explicit `converter` loader.
 */
export default class AutodetectConverter extends Converter {
  declare readonly options: Readonly<AutodetectConverterOptions>

  #videoConverter() {
    const options = this.options
    const resize = normalizeResize(options.resize)
    const format = binaryFormat(options.format)

    return createFfmpegThumbnailConverter({
      key: 'autodetect',
      ...(options.runner ? { runner: options.runner } : {}),
      ...(options.ffmpegCommand ? { command: options.ffmpegCommand } : {}),
      ...(options.startTime !== undefined ? { time: options.startTime } : {}),
      ...(resize.width !== undefined ? { width: resize.width } : {}),
      ...(resize.height !== undefined ? { height: resize.height } : {}),
      ...(format ? { format } : {}),
      ...(typeof options.folder === 'string' ? { folder: options.folder } : {}),
      ...(options.ffmpegTimeout ?? options.timeout) !== undefined
        ? { timeout: options.ffmpegTimeout ?? options.timeout }
        : {},
    })
  }

  async handle({ options: _options, ...source }: ConverterAttributes) {
    if (source.attachment.mimeType.startsWith('video/')) {
      return this.#videoConverter().convertSource!(source)
    }
    const { attachment } = source
    const options = this.options
    const resize = normalizeResize(options.resize)

    if (attachment.mimeType.startsWith('image/')) {
      const sharp = await loadSharp()
      const output = await renderSharpVariantFromFile({
        key: 'autodetect',
        sharp,
        ...resize,
        ...(options.format ? { format: options.format } : {}),
        autoOrient: options.autoOrient ?? true,
        ...(typeof options.folder === 'string' ? { folder: options.folder } : {}),
      }, await source.input.toFile(), attachment)
      const { body, ...attributes } = output
      return { ...attributes, data: { type: 'buffer' as const, buffer: body } }
    }

    if (attachment.mimeType === 'application/pdf') {
      return createPdfThumbnailConverter({
        key: 'autodetect',
        ...(options.runner ? { runner: options.runner } : {}),
        ...(options.pdftoppmCommand ? { command: options.pdftoppmCommand } : {}),
        ...(resize.width !== undefined ? { width: resize.width } : {}),
        ...(options.startPage !== undefined ? { page: options.startPage } : {}),
        ...(typeof options.folder === 'string' ? { folder: options.folder } : {}),
        ...(options.pdftoppmTimeout ?? options.timeout) !== undefined
          ? { timeout: options.pdftoppmTimeout ?? options.timeout }
          : {},
      }).convertSource!(source)
    }

    if (isOfficeDocument(attachment.mimeType)) {
      return createDocumentThumbnailConverter({
        key: 'autodetect',
        ...(options.runner ? { runner: options.runner } : {}),
        ...(options.pdftoppmCommand ? { command: options.pdftoppmCommand } : {}),
        ...(options.officeCommand ? { officeCommand: options.officeCommand } : {}),
        ...(resize.width !== undefined ? { width: resize.width } : {}),
        ...(options.startPage !== undefined ? { page: options.startPage } : {}),
        ...(typeof options.folder === 'string' ? { folder: options.folder } : {}),
        ...(options.officeTimeout ?? options.timeout) !== undefined
          ? { officeTimeout: options.officeTimeout ?? options.timeout }
          : {},
        ...(options.pdftoppmTimeout ?? options.timeout) !== undefined
          ? { pdfTimeout: options.pdftoppmTimeout ?? options.timeout }
          : {},
      }).convertSource!(source)
    }

    return undefined
  }
}

function normalizeResize(value: AutodetectConverterOptions['resize']): {
  width?: number
  height?: number
  resize?: SharpResizeOptions
} {
  if (typeof value === 'number') {
    return { width: value }
  }

  if (!value) {
    return {}
  }

  const { width, height, ...options } = value
  const resize = Object.keys(options).length > 0 ? options : undefined

  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(resize ? { resize } : {}),
  }
}

function binaryFormat(format: SharpFormat | undefined): 'jpeg' | 'png' | 'webp' | undefined {
  const value = typeof format === 'string' ? format : format?.format

  if (value === 'jpg' || value === 'jpeg') {
    return 'jpeg'
  }

  return value === 'png' || value === 'webp' ? value : undefined
}

function isOfficeDocument(mimeType: string): boolean {
  return [
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.presentation',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.text',
  ].includes(mimeType)
}

async function loadSharp(): Promise<(input: Buffer | string) => SharpImage> {
  const module = await loadOptionalDependency<{ default?: unknown }>('sharp')

  if (typeof module.default !== 'function') {
    throw new MissingOptionalDependencyError('sharp')
  }

  return module.default as (input: Buffer | string) => SharpImage
}
