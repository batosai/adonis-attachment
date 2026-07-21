/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { spawn } from 'node:child_process'

import type { MediaMetadataExtractor } from './media_metadata.js'
import type { VariantConverter } from '../variants/variant_converter.js'

export type CommandExecution = {
  command: string
  args: readonly string[]
  cwd?: string
}

export type CommandResult = {
  stdout: Uint8Array
  stderr: Uint8Array
}

export interface CommandRunner {
  run(execution: CommandExecution): Promise<CommandResult>
}

/** Executes a command without a shell and rejects when it returns a non-zero status. */
export class NodeCommandRunner implements CommandRunner {
  run(execution: CommandExecution): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(execution.command, execution.args, {
        ...(execution.cwd ? { cwd: execution.cwd } : {}),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const stdout: Uint8Array[] = []
      const stderr: Uint8Array[] = []

      child.stdout.on('data', (chunk: Uint8Array) => stdout.push(chunk))
      child.stderr.on('data', (chunk: Uint8Array) => stderr.push(chunk))
      child.once('error', reject)
      child.once('close', (code) => {
        const result = { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }

        if (code === 0) {
          resolve(result)
          return
        }

        reject(new CommandExecutionError(execution, code, Buffer.from(result.stderr).toString()))
      })
    })
  }
}

export class CommandExecutionError extends Error {
  constructor(execution: CommandExecution, code: number | null, stderr: string) {
    super(
      `Command "${execution.command}" exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr}` : ''}`
    )
    this.name = 'CommandExecutionError'
  }
}

export type FfprobeMetadataExtractorOptions = {
  runner?: CommandRunner
  command?: string
}

/** Extracts duration, codecs and video dimensions through ffprobe. */
export function createFfprobeMetadataExtractor(
  options: FfprobeMetadataExtractorOptions = {}
): MediaMetadataExtractor {
  const runner = options.runner ?? new NodeCommandRunner()
  const command = options.command ?? 'ffprobe'

  return {
    supports({ attachment }) {
      return attachment.mimeType.startsWith('audio/') || attachment.mimeType.startsWith('video/')
    },
    async extract({ attachment, body }) {
      return withTemporarySource(attachment.name, body, async (source) => {
        const result = await runner.run({
          command,
          args: ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', source],
        })

        return mapFfprobeMetadata(JSON.parse(Buffer.from(result.stdout).toString()) as FfprobeResult)
      })
    },
  }
}

export type FfmpegThumbnailConverterOptions = {
  key: string
  runner?: CommandRunner
  command?: string
  time?: number
  width?: number
  height?: number
  format?: 'jpeg' | 'png' | 'webp'
  folder?: string
}

/** Creates a video-frame thumbnail converter backed by ffmpeg. */
export function createFfmpegThumbnailConverter(
  options: FfmpegThumbnailConverterOptions
): VariantConverter {
  const runner = options.runner ?? new NodeCommandRunner()
  const command = options.command ?? 'ffmpeg'
  const format = options.format ?? 'jpeg'

  return createTemporaryThumbnailConverter(options.key, options.folder, async ({ attachment, body }, directory) => {
    const source = await writeSource(directory, attachment.name, body)
    const output = join(directory, `thumbnail.${format}`)
    const args = ['-y']

    if (options.time !== undefined) {
      args.push('-ss', String(options.time))
    }

    args.push('-i', source, '-frames:v', '1')
    if (options.width !== undefined || options.height !== undefined) {
      args.push('-vf', `scale=${options.width ?? -1}:${options.height ?? -1}`)
    }
    args.push(output)
    await runner.run({ command, args })

    return { output, format }
  })
}

export type PdfThumbnailConverterOptions = {
  key: string
  runner?: CommandRunner
  command?: string
  width?: number
  page?: number
  folder?: string
}

/** Renders the first PDF page to a PNG thumbnail with Poppler's pdftoppm. */
export function createPdfThumbnailConverter(options: PdfThumbnailConverterOptions): VariantConverter {
  const runner = options.runner ?? new NodeCommandRunner()
  const command = options.command ?? 'pdftoppm'

  return createTemporaryThumbnailConverter(options.key, options.folder, async ({ attachment, body }, directory) => {
    const source = await writeSource(directory, attachment.name, body)
    const outputBase = join(directory, 'thumbnail')
    const args = ['-f', String(options.page ?? 1), '-singlefile', '-png']

    if (options.width !== undefined) {
      args.push('-scale-to-x', String(options.width), '-scale-to-y', '-1')
    }

    args.push(source, outputBase)
    await runner.run({ command, args })

    return { output: `${outputBase}.png`, format: 'png' }
  })
}

export type DocumentThumbnailConverterOptions = PdfThumbnailConverterOptions & {
  officeCommand?: string
}

/** Converts an office document to PDF with LibreOffice, then renders its first page. */
export function createDocumentThumbnailConverter(
  options: DocumentThumbnailConverterOptions
): VariantConverter {
  const runner = options.runner ?? new NodeCommandRunner()
  const officeCommand = options.officeCommand ?? 'libreoffice'
  const pdfCommand = options.command ?? 'pdftoppm'

  return createTemporaryThumbnailConverter(options.key, options.folder, async ({ attachment, body }, directory) => {
    const source = await writeSource(directory, attachment.name, body)
    const converted = join(directory, `${basename(source, extname(source))}.pdf`)
    const outputBase = join(directory, 'thumbnail')

    await runner.run({
      command: officeCommand,
      args: ['--headless', '--convert-to', 'pdf', '--outdir', directory, source],
    })

    const args = ['-f', String(options.page ?? 1), '-singlefile', '-png']
    if (options.width !== undefined) {
      args.push('-scale-to-x', String(options.width), '-scale-to-y', '-1')
    }
    args.push(converted, outputBase)
    await runner.run({ command: pdfCommand, args })

    return { output: `${outputBase}.png`, format: 'png' }
  })
}

function createTemporaryThumbnailConverter(
  key: string,
  folder: string | undefined,
  convert: (
    input: Parameters<VariantConverter['convert']>[0],
    directory: string
  ) => Promise<{ output: string; format: 'jpeg' | 'png' | 'webp' }>
): VariantConverter {
  return {
    key,
    async convert(input) {
      return withTemporaryDirectory(async (directory) => {
        const result = await convert(input, directory)
        const body = await readFile(result.output)

        return {
          body,
          fileName: `${key}.${result.format}`,
          mimeType: mimeTypeForFormat(result.format),
          ...(folder ? { folder } : {}),
        }
      })
    },
  }
}

async function withTemporarySource<T>(name: string, body: Uint8Array, callback: (source: string) => Promise<T>): Promise<T> {
  return withTemporaryDirectory(async (directory) => callback(await writeSource(directory, name, body)))
}

async function withTemporaryDirectory<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'adonis-attachment-'))

  try {
    return await callback(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function writeSource(directory: string, name: string, body: Uint8Array): Promise<string> {
  const extension = extname(name) || '.bin'
  const source = join(directory, `source${extension}`)
  await writeFile(source, body)
  return source
}

type FfprobeResult = {
  format?: { duration?: string; bit_rate?: string; format_name?: string }
  streams?: Array<{
    codec_type?: string
    codec_name?: string
    width?: number
    height?: number
  }>
}

function mapFfprobeMetadata(result: FfprobeResult): Record<string, unknown> | undefined {
  const video = result.streams?.find((stream) => stream.codec_type === 'video')
  const audio = result.streams?.find((stream) => stream.codec_type === 'audio')
  const metadata = {
    ...(numberValue(result.format?.duration) !== undefined ? { duration: numberValue(result.format?.duration) } : {}),
    ...(numberValue(result.format?.bit_rate) !== undefined ? { bitRate: numberValue(result.format?.bit_rate) } : {}),
    ...(result.format?.format_name ? { format: result.format.format_name } : {}),
    ...(video?.width !== undefined ? { width: video.width } : {}),
    ...(video?.height !== undefined ? { height: video.height } : {}),
    ...(video?.codec_name ? { videoCodec: video.codec_name } : {}),
    ...(audio?.codec_name ? { audioCodec: audio.codec_name } : {}),
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function numberValue(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined
  }

  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function mimeTypeForFormat(format: 'jpeg' | 'png' | 'webp'): string {
  switch (format) {
    case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
  }
}
