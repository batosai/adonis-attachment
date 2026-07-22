/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { writeFile } from 'node:fs/promises'

import { test } from '@japa/runner'

import AutodetectConverter from '../src/converters/autodetect_converter.js'
import { ConfiguredVariantConverterRegistry } from '../src/converters/configured_variant_converter_registry.js'
import type { CommandExecution, CommandRunner } from '../src/media/binaries.js'
import type { Attachment } from '../src/core/attachment.js'

const pdf: Attachment = {
  id: 'attachment-id',
  disk: 'fs',
  path: 'uploads/report.pdf',
  name: 'report.pdf',
  originalName: 'report.pdf',
  mimeType: 'application/pdf',
  extname: 'pdf',
  size: 3,
}

class FakeRunner implements CommandRunner {
  executions: CommandExecution[] = []

  async run(execution: CommandExecution) {
    this.executions.push(execution)
    await writeFile(`${execution.args.at(-1)!}.png`, new Uint8Array([4, 5]))
    return { stdout: new Uint8Array(), stderr: new Uint8Array() }
  }
}

test.group('AutodetectConverter', () => {
  test('uses Poppler for PDFs and honors v5-style options', async ({ assert }) => {
    const runner = new FakeRunner()
    const converter = new AutodetectConverter({ runner, resize: 320, startPage: 2, folder: 'variants' })

    const output = await converter.handle({ attachment: pdf, body: new Uint8Array([1, 2, 3]), options: converter.options })

    assert.deepEqual(output, {
      body: new Uint8Array([4, 5]),
      fileName: 'autodetect.png',
      mimeType: 'image/png',
      folder: 'variants',
    })
    assert.deepEqual(runner.executions[0]?.args.slice(0, 8), [
      '-f', '2', '-singlefile', '-png', '-scale-to-x', '320', '-scale-to-y', '-1',
    ])
  })

  test('is used when a configured key has no converter loader', async ({ assert }) => {
    const registry = new ConfiguredVariantConverterRegistry({ thumbnail: { blurhash: true } })
    const converter = await registry.get('thumbnail')

    assert.equal(converter?.key, 'thumbnail')
    assert.isTrue(converter?.blurhash === true)
    assert.isUndefined(await converter?.convert({
      attachment: { ...pdf, mimeType: 'application/zip', name: 'archive.zip' },
      body: new Uint8Array(),
    }))
  })
})
