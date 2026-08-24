/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { createV5CompatibleMetadataExtractors } from '../src/media/v5_metadata.js'
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

test.group('v5-compatible metadata profile', () => {
  test('registers every v5 metadata source by default', ({ assert }) => {
    const extractors = createV5CompatibleMetadataExtractors()

    assert.lengthOf(extractors, 3)
  })

  test('allows individual metadata sources to be disabled', ({ assert }) => {
    const extractors = createV5CompatibleMetadataExtractors({ exif: false, pdfinfo: false })

    assert.lengthOf(extractors, 1)
  })

  test('reuses shared ffprobe binary configuration while allowing local overrides', async ({ assert }) => {
    const runner = new FakeRunner()
    const [extractor] = createV5CompatibleMetadataExtractors({
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
