/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { createDefaultMetadataExtractors } from '../src/media/default_metadata.js'
import type { CommandExecution, CommandRunner } from '../src/media/binaries.js'
import type { Attachment } from '../src/core/attachment.js'

const video: Attachment = {
  id: 'attachment-id', disk: 'fs', path: 'uploads/video.mp4', name: 'video.mp4',
  originalName: 'video.mp4', mimeType: 'video/mp4', extname: 'mp4', size: 3,
}

class FakeRunner implements CommandRunner {
  execution: CommandExecution | undefined

  async run(execution: CommandExecution) {
    this.execution = execution
    return { stdout: Buffer.from(JSON.stringify({ format: {}, streams: [] })), stderr: new Uint8Array() }
  }
}

test.group('default metadata profile', () => {
  test('registers every metadata source by default', ({ assert }) => {
    const extractors = createDefaultMetadataExtractors()

    assert.lengthOf(extractors, 3)
  })

  test('allows individual metadata sources to be disabled', ({ assert }) => {
    const extractors = createDefaultMetadataExtractors({ exif: false, pdfinfo: false })

    assert.lengthOf(extractors, 1)
  })

  test('reuses shared ffprobe binary configuration while allowing local overrides', async ({ assert }) => {
    const runner = new FakeRunner()
    const [extractor] = createDefaultMetadataExtractors({
      exif: false,
      pdfinfo: false,
      binaries: { ffprobe: { command: '/opt/media/ffprobe', timeout: 5_000 } },
      ffprobe: { runner, timeout: 1_000 },
    })

    await extractor!.extract({ attachment: video, body: new Uint8Array() })

    assert.equal(runner.execution?.command, '/opt/media/ffprobe')
    assert.equal(runner.execution?.timeout, 1_000)
  })
})
