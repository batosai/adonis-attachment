/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { spawn } from 'node:child_process'

import type { MediaMetadataExtractor } from './media_metadata.js'
import type { AttachmentMetadata } from './media_metadata.js'
import { defineSourceConverter, type SourceConversionInput, type VariantConverter } from '../variants/variant_converter.js'
import { AttachmentError } from '../errors.js'

export type CommandExecution = {
  command: string
  args: readonly string[]
  cwd?: string
  timeout?: number
}

export type CommandResult = {
  stdout: Uint8Array
  stderr: Uint8Array
}

export interface CommandRunner {
  run(execution: CommandExecution): Promise<CommandResult>
}

const MAX_STDOUT_BYTES = 4 * 1024 * 1024
const MAX_STDERR_BYTES = 64 * 1024

/** Executes a command without a shell and bounds the captured output. */
export class NodeCommandRunner implements CommandRunner {
  run(execution: CommandExecution): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController()
      const timeout = execution.timeout === undefined
        ? undefined
        : setTimeout(() => controller.abort(), execution.timeout)
      const child = spawn(execution.command, execution.args, {
        ...(execution.cwd ? { cwd: execution.cwd } : {}),
        signal: controller.signal,
        killSignal: 'SIGKILL',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const stdout: Buffer[] = []
      let stdoutSize = 0
      let stdoutOverflow = false
      const stderr = new StderrTail()
      let processError: Error | undefined

      child.stdout.on('data', (chunk: Buffer) => {
        if (stdoutOverflow) return
        if (stdoutSize + chunk.length > MAX_STDOUT_BYTES) {
          stdoutOverflow = true
          controller.abort()
          return
        }
        stdoutSize += chunk.length
        stdout.push(chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => stderr.append(chunk))
      child.once('error', (error) => { processError = error })
      child.once('close', (code) => {
        if (timeout) clearTimeout(timeout)
        if (stdoutOverflow) {
          reject(new AttachmentError(`Command "${execution.command}" exceeded the ${MAX_STDOUT_BYTES}-byte stdout limit`, {
            code: 'E_COMMAND_OUTPUT_TOO_LARGE',
          }))
          return
        }
        if (controller.signal.aborted) {
          reject(new CommandTimeoutError(execution))
          return
        }
        if (processError) {
          reject(new CommandExecutionError(execution, null, processError.message, { cause: processError }))
          return
        }
        const capturedStderr = stderr.read()
        if (code === 0) {
          resolve({ stdout: Buffer.concat(stdout, stdoutSize), stderr: capturedStderr })
          return
        }
        reject(new CommandExecutionError(execution, code, capturedStderr.toString()))
      })
    })
  }
}

/** Keeps the most recent diagnostics even when a command logs continuously. */
class StderrTail {
  #buffer?: Buffer
  #offset = 0
  #full = false

  append(chunk: Buffer): void {
    this.#buffer ??= Buffer.allocUnsafe(MAX_STDERR_BYTES)
    const bytes = chunk.subarray(Math.max(0, chunk.length - MAX_STDERR_BYTES))
    const first = Math.min(bytes.length, MAX_STDERR_BYTES - this.#offset)
    bytes.copy(this.#buffer, this.#offset, 0, first)
    bytes.copy(this.#buffer, 0, first)
    const end = this.#offset + bytes.length
    this.#full ||= end >= MAX_STDERR_BYTES
    this.#offset = end % MAX_STDERR_BYTES
  }

  read(): Buffer {
    if (!this.#buffer) return Buffer.alloc(0)
    if (!this.#full) return this.#buffer.subarray(0, this.#offset)
    return Buffer.concat([this.#buffer.subarray(this.#offset), this.#buffer.subarray(0, this.#offset)])
  }
}

export class CommandExecutionError extends AttachmentError {
  static code = 'E_COMMAND_EXECUTION_FAILED'

  constructor(execution: CommandExecution, code: number | null, stderr: string, options?: ErrorOptions) {
    super(
      `Command "${execution.command}" exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr}` : ''}`
    )
    if (options?.cause) {
      this.cause = options.cause
    }
    this.name = 'CommandExecutionError'
  }
}

export class CommandTimeoutError extends AttachmentError {
  static code = 'E_COMMAND_TIMEOUT'
  static status = 504

  constructor(execution: CommandExecution) {
    super(`Command "${execution.command}" exceeded its ${execution.timeout}ms timeout`)
    this.name = 'CommandTimeoutError'
  }
}

export type FfprobeMetadataExtractorOptions = {
  runner?: CommandRunner
  command?: string
  timeout?: number
}

export type PdfInfoMetadataExtractorOptions = {
  runner?: CommandRunner
  command?: string
  timeout?: number
}

/** Extracts the v5 PDF dimensions, page count, version, and creation date through pdfinfo. */
export function createPdfInfoMetadataExtractor(
  options: PdfInfoMetadataExtractorOptions = {}
): MediaMetadataExtractor {
  const runner = options.runner ?? new NodeCommandRunner()
  const command = options.command ?? 'pdfinfo'

  async function extractFile(source: string) {
    const result = await runner.run({
      command,
      args: [source],
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
    })
    return mapPdfInfoMetadata(Buffer.from(result.stdout).toString())
  }

  return {
    supports({ attachment }) {
      return attachment.mimeType === 'application/pdf'
    },
    extractFile,
    extract({ attachment, body }) {
      return withTemporarySource(attachment.name, body, extractFile)
    },
  }
}

/** Extracts duration, codecs and video dimensions through ffprobe. */
export function createFfprobeMetadataExtractor(
  options: FfprobeMetadataExtractorOptions = {}
): MediaMetadataExtractor {
  const runner = options.runner ?? new NodeCommandRunner()
  const command = options.command ?? 'ffprobe'

  async function extractFile(source: string) {
    const result = await runner.run({
      command,
      args: ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', source],
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
    })

    return mapFfprobeMetadata(JSON.parse(Buffer.from(result.stdout).toString()) as FfprobeResult)
  }

  return {
    supports({ attachment }) {
      return attachment.mimeType.startsWith('audio/') || attachment.mimeType.startsWith('video/')
    },
    extractFile,
    extract({ attachment, body }) {
      return withTemporarySource(attachment.name, body, extractFile)
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
  timeout?: number
}

/** Creates a video-frame thumbnail converter backed by ffmpeg. */
export function createFfmpegThumbnailConverter(
  options: FfmpegThumbnailConverterOptions
): VariantConverter {
  const runner = options.runner ?? new NodeCommandRunner()
  const command = options.command ?? 'ffmpeg'
  const format = options.format ?? 'jpeg'

  return defineSourceConverter({
    key: options.key,
    async convertSource({ input, context }) {
      const source = await input.toFile()
      const output = await context.createTempFile({ extension: format })
      const args = ['-y']

      if (options.time !== undefined) {
        args.push('-ss', String(options.time))
      }

      args.push('-i', source, '-frames:v', '1')
      if (options.width !== undefined || options.height !== undefined) {
        args.push('-vf', `scale=${options.width ?? -1}:${options.height ?? -1}`)
      }
      args.push(output)
      await runner.run({ command, args, ...(options.timeout !== undefined ? { timeout: options.timeout } : {}) })

      return {
        data: { type: 'file', path: output },
        fileName: `${options.key}.${format}`,
        mimeType: mimeTypeForFormat(format),
        ...(options.folder ? { folder: options.folder } : {}),
      }
    },
  })
}

export type PdfThumbnailConverterOptions = {
  key: string
  runner?: CommandRunner
  command?: string
  width?: number
  page?: number
  folder?: string
  timeout?: number
}

/** Renders the first PDF page to a PNG thumbnail with Poppler's pdftoppm. */
export function createPdfThumbnailConverter(options: PdfThumbnailConverterOptions): VariantConverter {
  const runner = options.runner ?? new NodeCommandRunner()
  const command = options.command ?? 'pdftoppm'

  return createTemporaryThumbnailConverter(options.key, options.folder, async ({ input, context }) => {
    const source = await input.toFile()
    const output = await context.createTempFile({ extension: 'png' })
    const outputBase = output.slice(0, -4)
    const args = ['-f', String(options.page ?? 1), '-singlefile', '-png']

    if (options.width !== undefined) {
      args.push('-scale-to-x', String(options.width), '-scale-to-y', '-1')
    }

    args.push(source, outputBase)
    await runner.run({ command, args, ...(options.timeout !== undefined ? { timeout: options.timeout } : {}) })

    return output
  })
}

export type DocumentThumbnailConverterOptions = PdfThumbnailConverterOptions & {
  officeCommand?: string
  officeTimeout?: number
  pdfTimeout?: number
}

/** Converts an office document to PDF with LibreOffice, then renders its first page. */
export function createDocumentThumbnailConverter(
  options: DocumentThumbnailConverterOptions
): VariantConverter {
  const runner = options.runner ?? new NodeCommandRunner()
  const officeCommand = options.officeCommand ?? 'libreoffice'
  const pdfCommand = options.command ?? 'pdftoppm'

  return createTemporaryThumbnailConverter(options.key, options.folder, async ({ input, context }) => {
    const source = await input.toFile()
    const output = await context.createTempFile({ extension: 'png' })
    const outputBase = output.slice(0, -4)
    return withTemporaryDirectory(async (directory) => {
      const converted = join(directory, `${basename(source, extname(source))}.pdf`)

      await runner.run({
        command: officeCommand,
        args: ['--headless', '--convert-to', 'pdf', '--outdir', directory, source],
        ...(options.officeTimeout ?? options.timeout) !== undefined
          ? { timeout: options.officeTimeout ?? options.timeout }
          : {},
      })

      const args = ['-f', String(options.page ?? 1), '-singlefile', '-png']
      if (options.width !== undefined) {
        args.push('-scale-to-x', String(options.width), '-scale-to-y', '-1')
      }
      args.push(converted, outputBase)
      await runner.run({
        command: pdfCommand,
        args,
        ...(options.pdfTimeout ?? options.timeout) !== undefined
          ? { timeout: options.pdfTimeout ?? options.timeout }
          : {},
      })

      return output
    })
  })
}

function createTemporaryThumbnailConverter(
  key: string,
  folder: string | undefined,
  convert: (input: SourceConversionInput) => Promise<string>
): VariantConverter {
  return defineSourceConverter({
    key,
    async convertSource(input) {
      return {
        data: { type: 'file', path: await convert(input) },
        fileName: `${key}.png`,
        mimeType: 'image/png',
        ...(folder ? { folder } : {}),
      }
    },
  })
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

function mapFfprobeMetadata(result: FfprobeResult): AttachmentMetadata | undefined {
  const video = result.streams?.find((stream) => stream.codec_type === 'video')
  const audio = result.streams?.find((stream) => stream.codec_type === 'audio')
  const duration = numberValue(result.format?.duration)
  const bitRate = numberValue(result.format?.bit_rate)
  const metadata = {
    ...(duration !== undefined ? { duration } : {}),
    ...(bitRate !== undefined ? { bitRate } : {}),
    ...(result.format?.format_name ? { format: result.format.format_name } : {}),
    ...(video?.width !== undefined && video.height !== undefined
      ? { dimension: { width: video.width, height: video.height } }
      : {}),
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

function mapPdfInfoMetadata(stdout: string): AttachmentMetadata | undefined {
  const values = Object.fromEntries(
    stdout.split('\n').flatMap((line) => {
      const separator = line.indexOf(':')
      if (separator < 1) {
        return []
      }

      return [[line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()]]
    })
  ) as Record<string, string>
  const pageSize = values['page size']?.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i)
  const pages = integerValue(values.pages)
  const date = pdfDate(values.creationdate)
  const metadata: AttachmentMetadata = {
    ...(pageSize ? { dimension: { width: Number.parseInt(pageSize[1]!, 10), height: Number.parseInt(pageSize[2]!, 10) } } : {}),
    ...(pages !== undefined ? { pages } : {}),
    ...(values['pdf version'] ? { version: values['pdf version'] } : {}),
    ...(date ? { date } : {}),
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function integerValue(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) ? number : undefined
}

function pdfDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString()
  }

  const parts = value.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (!parts) {
    return undefined
  }

  return new Date(Date.UTC(
    Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), Number(parts[4]), Number(parts[5]), Number(parts[6])
  )).toISOString()
}

function mimeTypeForFormat(format: 'jpeg' | 'png' | 'webp'): string {
  switch (format) {
    case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
  }
}
