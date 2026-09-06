import { test } from '@japa/runner'
import sharp from 'sharp'
import ExifReader from 'exifreader'

import { defineConfig, AttachmentService, AttachmentManager, type Attachment } from '../index.js'
import { createDefaultMetadataExtractors } from '../src/media/default_metadata.js'
import { createExifMetadataExtractor } from '../src/media/exif.js'
import { createSharpMetadataExtractor } from '../src/media/sharp.js'
import { MediaMetadataService } from '../src/media/media_metadata.js'

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"><rect width="32" height="24" fill="red"/></svg>')
const original: Attachment = {
  id: 'image', disk: 'fs', path: 'image.svg', name: 'image.svg', originalName: 'image.svg',
  mimeType: 'image/svg+xml', extname: 'svg', size: svg.length,
}

test.group('real image metadata', () => {
  test('persists SVG with default configuration and meta enabled without variants', async ({ assert }) => {
    const files: Uint8Array[] = []
    const config = await defineConfig({
      storage: {
        async write(input) { files.push(input.body) },
        async read() { return files[0]! },
        async remove() {},
      },
    }).resolver({} as never)
    const manager = new AttachmentManager(new AttachmentService(config))
    const draft = await manager.createFromBuffer(svg, { originalName: 'image.svg', mimeType: 'image/svg+xml', meta: true })
    const attachment = await draft.persist()
    assert.deepEqual(attachment.metadata?.dimension, { width: 32, height: 24 })
    assert.equal(attachment.metadata?.format, 'svg')
    assert.lengthOf(files, 1)
    assert.deepEqual(files[0], svg)
  })

  test('reads a real PNG through the default Sharp and EXIF extractors', async ({ assert }) => {
    const body = await sharp(svg).png().toBuffer()
    const metadata = await new MediaMetadataService(createDefaultMetadataExtractors()).extract({
      attachment: { ...original, mimeType: 'image/png' }, body,
    })
    assert.deepEqual(metadata?.dimension, { width: 32, height: 24 })
    assert.equal(metadata?.format, 'png')
  })

  test('reads actual ExifReader GPS values from a generated JPEG without a wrapper', async ({ assert }) => {
    const body = await sharp(svg).withExif({
      IFD0: { Software: 'Attachment test' },
      IFD3: {
        GPSLatitudeRef: 'N', GPSLatitude: '48/1 30/1 0/1',
        GPSLongitudeRef: 'W', GPSLongitude: '2/1 15/1 0/1',
        GPSAltitudeRef: '0', GPSAltitude: '35/1',
      },
    }).jpeg().toBuffer()
    const attachment = { ...original, mimeType: 'image/jpeg' }
    const metadata = await new MediaMetadataService(createDefaultMetadataExtractors()).extract({ attachment, body })
    assert.deepEqual(metadata?.gps, { latitude: 48.5, longitude: -2.25, altitude: 35 })
    assert.equal(metadata?.host, 'Attachment test')
    assert.deepEqual(metadata?.dimension, { width: 32, height: 24 })
    assert.equal(metadata?.orientation?.description, 'top-left')

    const injected = await createExifMetadataExtractor({ reader: ExifReader }).extract({ attachment, body })
    assert.deepEqual(injected?.gps, metadata?.gps)
  })

  test('accepts the actual Sharp factory without a double cast', async ({ assert }) => {
    const metadata = await createSharpMetadataExtractor(sharp).extract({ attachment: original, body: svg })
    assert.deepEqual(metadata?.dimension, { width: 32, height: 24 })
  })

  test('does not initialize EXIF for SVG or image readers for DOCX', async ({ assert }) => {
    let reads = 0
    const profile = createDefaultMetadataExtractors({
      exif: { reader: async () => { throw new Error('EXIF must not load') } },
      sharp: () => ({ async metadata() { reads++; return { width: 32, height: 24 } } }),
    })
    const service = new MediaMetadataService(profile)
    await service.extract({ attachment: original, body: svg })
    assert.equal(reads, 1)
    assert.isUndefined(await service.extract({
      attachment: { ...original, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      body: new Uint8Array(),
    }))
    assert.equal(reads, 1)
  })

  test('does not swallow a corrupt supported image error', async ({ assert }) => {
    await assert.rejects(() => new MediaMetadataService(createDefaultMetadataExtractors()).extract({
      attachment: { ...original, mimeType: 'image/png' }, body: Buffer.from('not a PNG'),
    }))
  })
})
