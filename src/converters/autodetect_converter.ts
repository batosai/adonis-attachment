/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import Converter, { type ConverterAttributes, type ConverterOptions } from './converter.js'
import {
  createDocumentThumbnailConverter,
  createFfmpegThumbnailConverter,
  createPdfThumbnailConverter,
  type CommandRunner,
} from '../media/binaries.js'
import { createSharpVariantConverter, type SharpFactory, type SharpResizeOptions } from '../media/sharp.js'

export type AutodetectConverterOptions = ConverterOptions & {
  resize?: number | {
    width?: number
    height?: number
    fit?: string
    position?: string
    withoutEnlargement?: boolean
  }
  format?: 'avif' | 'jpeg' | 'jpg' | 'png' | 'webp'
  folder?: string
  startTime?: number
  startPage?: number
  runner?: CommandRunner
  ffmpegCommand?: string
  pdftoppmCommand?: string
  officeCommand?: string
}

/**
 * Default v5-compatible converter selected when a configured key has no
 * explicit `converter` loader.
 */
export default class AutodetectConverter extends Converter {
  declare readonly options: Readonly<AutodetectConverterOptions>

  async handle({ attachment, body }: ConverterAttributes) {
    const options = this.options
    const resize = normalizeResize(options.resize)

    if (attachment.mimeType.startsWith('image/')) {
      const sharp = await loadSharp()
      return createSharpVariantConverter({
        key: 'autodetect',
        sharp,
        ...resize,
        ...(options.format ? { format: normalizeImageFormat(options.format) } : {}),
        ...(options.folder ? { folder: options.folder } : {}),
      }).convert({ attachment, body })
    }

    if (attachment.mimeType.startsWith('video/')) {
      return createFfmpegThumbnailConverter({
        key: 'autodetect',
        ...(options.runner ? { runner: options.runner } : {}),
        ...(options.ffmpegCommand ? { command: options.ffmpegCommand } : {}),
        ...(options.startTime !== undefined ? { time: options.startTime } : {}),
        ...(resize.width !== undefined ? { width: resize.width } : {}),
        ...(resize.height !== undefined ? { height: resize.height } : {}),
        ...(isBinaryFormat(options.format) ? { format: options.format === 'jpg' ? 'jpeg' : options.format } : {}),
        ...(options.folder ? { folder: options.folder } : {}),
      }).convert({ attachment, body })
    }

    if (attachment.mimeType === 'application/pdf') {
      return createPdfThumbnailConverter({
        key: 'autodetect',
        ...(options.runner ? { runner: options.runner } : {}),
        ...(options.pdftoppmCommand ? { command: options.pdftoppmCommand } : {}),
        ...(resize.width !== undefined ? { width: resize.width } : {}),
        ...(options.startPage !== undefined ? { page: options.startPage } : {}),
        ...(options.folder ? { folder: options.folder } : {}),
      }).convert({ attachment, body })
    }

    if (isOfficeDocument(attachment.mimeType)) {
      return createDocumentThumbnailConverter({
        key: 'autodetect',
        ...(options.runner ? { runner: options.runner } : {}),
        ...(options.pdftoppmCommand ? { command: options.pdftoppmCommand } : {}),
        ...(options.officeCommand ? { officeCommand: options.officeCommand } : {}),
        ...(resize.width !== undefined ? { width: resize.width } : {}),
        ...(options.startPage !== undefined ? { page: options.startPage } : {}),
        ...(options.folder ? { folder: options.folder } : {}),
      }).convert({ attachment, body })
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

function normalizeImageFormat(format: NonNullable<AutodetectConverterOptions['format']>): 'avif' | 'jpeg' | 'png' | 'webp' {
  return format === 'jpg' ? 'jpeg' : format
}

function isBinaryFormat(format: AutodetectConverterOptions['format']): format is 'jpeg' | 'jpg' | 'png' | 'webp' {
  return format === 'jpeg' || format === 'jpg' || format === 'png' || format === 'webp'
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

async function loadSharp(): Promise<SharpFactory> {
  const specifier = 'sharp'
  const module = await import(specifier) as { default?: unknown }

  if (typeof module.default !== 'function') {
    throw new Error('Autodetect image conversion requires the optional "sharp" dependency')
  }

  return module.default as SharpFactory
}
