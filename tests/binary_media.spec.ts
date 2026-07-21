/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { readFile, writeFile } from 'node:fs/promises'
import { test } from '@japa/runner'

import type { Attachment } from '../src/core/attachment.js'
import {
  createDocumentThumbnailConverter,
  createFfmpegThumbnailConverter,
  createFfprobeMetadataExtractor,
  createPdfInfoMetadataExtractor,
  createPdfThumbnailConverter,
  type CommandExecution,
  type CommandRunner,
} from '../src/media/binaries.js'

const video: Attachment = {
  id: 'attachment-id',
  disk: 'fs',
  path: 'uploads/video.mp4',
  name: 'video.mp4',
  originalName: 'video.mp4',
  mimeType: 'video/mp4',
  extname: 'mp4',
  size: 3,
}

class FakeRunner implements CommandRunner {
  executions: CommandExecution[] = []
  stdout = new Uint8Array()

  async run(execution: CommandExecution) {
    this.executions.push(execution)

    if (execution.command === 'ffmpeg') {
      await writeFile(execution.args.at(-1)!, new Uint8Array([4, 5]))
    }
    if (execution.command === 'pdftoppm') {
      await writeFile(`${execution.args.at(-1)!}.png`, new Uint8Array([6, 7]))
    }
    if (execution.command === 'libreoffice') {
      const source = execution.args.at(-1)!
      await writeFile(source.replace(/\.[^.]+$/, '.pdf'), await readFile(source))
    }

    return { stdout: this.stdout, stderr: new Uint8Array() }
  }
}

test.group('Binary media adapters', () => {
  test('extracts normalized ffprobe metadata', async ({ assert }) => {
    const runner = new FakeRunner()
    runner.stdout = Buffer.from(JSON.stringify({
      format: { duration: '12.5', bit_rate: '450000', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    }))
    const extractor = createFfprobeMetadataExtractor({ runner })

    const metadata = await extractor.extract({ attachment: video, body: new Uint8Array([1, 2, 3]) })

    assert.deepEqual(metadata, {
      duration: 12.5,
      bitRate: 450000,
      format: 'mov,mp4,m4a,3gp,3g2,mj2',
      dimension: { width: 1920, height: 1080 },
      videoCodec: 'h264',
      audioCodec: 'aac',
    })
    assert.equal(runner.executions[0]?.command, 'ffprobe')
    assert.isTrue(await extractor.supports!({ attachment: video }))
    assert.isFalse(await extractor.supports!({ attachment: { ...video, mimeType: 'application/pdf' } }))
  })

  test('creates ffmpeg, PDF and office-document thumbnails', async ({ assert }) => {
    const runner = new FakeRunner()
    const ffmpeg = createFfmpegThumbnailConverter({
      key: 'video-thumb', runner, time: 3, width: 320, format: 'webp', folder: 'variants',
    })
    const pdf = createPdfThumbnailConverter({ key: 'pdf-thumb', runner, width: 400 })
    const document = createDocumentThumbnailConverter({ key: 'doc-thumb', runner, width: 400 })

    assert.deepEqual(await ffmpeg.convert({ attachment: video, body: new Uint8Array([1]) }), {
      body: new Uint8Array([4, 5]), fileName: 'video-thumb.webp', mimeType: 'image/webp', folder: 'variants',
    })
    assert.deepEqual(await pdf.convert({ attachment: { ...video, name: 'report.pdf' }, body: new Uint8Array([2]) }), {
      body: new Uint8Array([6, 7]), fileName: 'pdf-thumb.png', mimeType: 'image/png',
    })
    assert.deepEqual(await document.convert({ attachment: { ...video, name: 'report.docx' }, body: new Uint8Array([3]) }), {
      body: new Uint8Array([6, 7]), fileName: 'doc-thumb.png', mimeType: 'image/png',
    })
    assert.deepEqual(runner.executions.map((execution) => execution.command), [
      'ffmpeg', 'pdftoppm', 'libreoffice', 'pdftoppm',
    ])
    assert.include(runner.executions[0]?.args ?? [], '-ss')
    assert.include(runner.executions[0]?.args ?? [], 'scale=320:-1')
  })

  test('extracts v5-compatible PDF metadata through pdfinfo', async ({ assert }) => {
    const runner = new FakeRunner()
    runner.stdout = Buffer.from([
      'Pages:          4',
      'Page size:      612 x 792 pts (letter)',
      'PDF version:    1.7',
      'CreationDate:   Wed Jan 15 18:51:34 2020 UTC',
    ].join('\n'))
    const extractor = createPdfInfoMetadataExtractor({ runner })

    assert.deepEqual(
      await extractor.extract({ attachment: { ...video, mimeType: 'application/pdf', name: 'report.pdf' }, body: new Uint8Array([1]) }),
      {
        dimension: { width: 612, height: 792 },
        pages: 4,
        version: '1.7',
        date: '2020-01-15T18:51:34.000Z',
      }
    )
    assert.equal(runner.executions[0]?.command, 'pdfinfo')
  })
})
