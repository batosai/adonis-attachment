import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface AttachmentInput {
  readonly size: number
  toFile(): Promise<string>
  toBuffer(options?: { maxBytes?: number }): Promise<Buffer>
  toStream(): Promise<Readable>
}

export interface ConversionContext {
  createTempFile(options?: { extension?: string }): Promise<string>
}

export class ConversionWorkspace implements ConversionContext {
  #directory?: Promise<string>

  async createTempFile({ extension = '' }: { extension?: string } = {}): Promise<string> {
    const suffix = extension.replace(/^\./, '')
    if (suffix && !/^[a-z0-9]+$/i.test(suffix)) {
      throw new TypeError('Expected a file extension without path separators')
    }
    this.#directory ??= mkdtemp(join(tmpdir(), 'adonis-attachment-'))
    return join(await this.#directory, randomUUID() + (suffix ? `.${suffix}` : ''))
  }

  async use<T>(callback: () => Promise<T>): Promise<T> {
    let failed = false
    let failure: unknown
    try {
      return await callback()
    } catch (error) {
      failed = true
      failure = error
      throw error
    } finally {
      try {
        if (this.#directory) {
          await rm(await this.#directory, { recursive: true, force: true })
        }
      } catch (error) {
        if (failed) {
          if (error === failure) throw failure
          throw new AggregateError([failure, error], 'Conversion and temporary file cleanup failed')
        }
        throw error
      }
    }
  }
}

export function createConversionSource(
  size: number,
  extension: string,
  open: () => Promise<Readable>,
  workspace: ConversionWorkspace
): AttachmentInput {
  let file: Promise<string> | undefined
  return {
    size,
    toStream: open,
    toFile() {
      file ??= (async () => {
        const path = await workspace.createTempFile({
          ...(/^[a-z0-9]+$/i.test(extension) ? { extension } : {}),
        })
        const stream = await open()
        await pipeline(stream, createWriteStream(path, { flags: 'wx', mode: 0o600 }))
        return path
      })()
      return file
    },
    async toBuffer({ maxBytes } = {}) {
      if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
        throw new RangeError('maxBytes must be a non-negative safe integer')
      }
      if (maxBytes !== undefined && size > maxBytes) {
        throw new RangeError('Conversion source exceeds maxBytes')
      }
      const chunks: Buffer[] = []
      let length = 0
      for await (const chunk of await open()) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        length += bytes.length
        if (maxBytes !== undefined && length > maxBytes) {
          throw new RangeError('Conversion source exceeds maxBytes')
        }
        chunks.push(bytes)
      }
      return Buffer.concat(chunks, length)
    },
  }
}
