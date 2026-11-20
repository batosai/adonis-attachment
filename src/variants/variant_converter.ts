/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { Readable } from 'node:stream'
import { createReadStream } from 'node:fs'
import { ConversionWorkspace, createConversionSource } from './conversion_source.js'
import type { AttachmentInput, ConversionContext } from './conversion_source.js'
import type { Attachment } from '../core/attachment.js'
import type { BlurhashOptions } from '../media/blurhash.js'
import type { VariantFolder } from './variant_path.js'

export type VariantConversionInput = {
  attachment: Attachment
  body: Uint8Array
}

export type VariantConversionOutput = {
  body: Uint8Array
  fileName: string
  mimeType: string
  folder?: VariantFolder
  metadata?: Record<string, unknown>
  blurhash?: string
}

export interface VariantConverter {
  key: string
  blurhash?: BlurhashOptions
  convertSource?(input: SourceConversionInput): Promise<SourceConversionOutput | undefined>
  convert(input: VariantConversionInput): Promise<VariantConversionOutput | undefined>
}

export type SourceConversionInput = {
  attachment: Attachment
  input: AttachmentInput
  context: ConversionContext
}

export type SourceConversionOutput = Omit<VariantConversionOutput, 'body'> & {
  data: { type: 'buffer'; buffer: Uint8Array } | { type: 'file'; path: string } | { type: 'stream'; stream: Readable }
}

/** Registers a source-based converter with the existing converter registry. */
export function defineSourceConverter(
  converter: Pick<VariantConverter, 'key' | 'blurhash'> & {
    convertSource(input: SourceConversionInput): Promise<SourceConversionOutput | undefined>
  }
): VariantConverter {
  return {
    ...converter,
    async convert({ attachment, body }) {
      const workspace = new ConversionWorkspace()
      return workspace.use(async () => {
        const input = createConversionSource(body.byteLength, attachment.extname,
          async () => Readable.from([body]), workspace)
        const output = await converter.convertSource({ attachment, input, context: workspace })
        if (!output) return undefined
        const { data, ...attributes } = output
        if (data.type === 'buffer') return { ...attributes, body: data.buffer }
        const stream = data.type === 'file' ? createReadStream(data.path) : data.stream
        const result = createConversionSource(0, '', async () => stream, workspace)
        return { ...attributes, body: await result.toBuffer() }
      })
    },
  }
}
