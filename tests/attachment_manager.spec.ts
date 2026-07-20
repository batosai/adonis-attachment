/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { test } from '@japa/runner'

import {
  AttachmentDraft,
  AttachmentManager,
  AttachmentSourceError,
  type CreateAttachmentInput,
} from '../index.js'

function createManager(options: ConstructorParameters<typeof AttachmentManager>[1] = {}) {
  const inputs: Array<{ input: CreateAttachmentInput; options: Record<string, unknown> | undefined }> = []
  let count = 0
  const manager = new AttachmentManager(
    {
      createDraft(input, attachmentOptions) {
        inputs.push({ input, options: attachmentOptions })
        count += 1
        return {
          id: `attachment-${count}`,
          disk: input.disk ?? 'public',
          name: input.originalName,
          originalName: input.originalName,
          path: input.originalName,
          size: input.body.byteLength,
          extname: input.originalName.split('.').at(-1) ?? '',
          mimeType: input.mimeType ?? 'application/octet-stream',
          isPersisted: false,
        } as AttachmentDraft
      },
    },
    options
  )

  return { manager, inputs }
}

test.group('AttachmentManager', () => {
  test('creates a draft from a buffer with supplied persistence options', async ({ assert }) => {
    const { manager, inputs } = createManager()

    const attachment = await manager.createFromBuffer(new Uint8Array([1, 2, 3]), {
      originalName: 'avatar.jpg',
      disk: 's3',
      folder: 'users/42',
      metadata: { imported: true },
    })

    assert.equal(attachment.mimeType, 'image/jpeg')
    assert.isFalse(attachment.isPersisted)
    assert.deepEqual(inputs, [{
      input: {
        body: new Uint8Array([1, 2, 3]),
        originalName: 'avatar.jpg',
        mimeType: 'image/jpeg',
        metadata: { imported: true },
      },
      options: { disk: 's3', folder: 'users/42' },
    }])
  })

  test('reads a path and derives its filename and MIME type', async ({ assert }) => {
    const directory = await mkdtemp(join(tmpdir(), 'adonis-attachment-'))

    try {
      const path = join(directory, 'report.pdf')
      await writeFile(path, new Uint8Array([1, 2]))
      const { manager, inputs } = createManager()

      await manager.createFromPath(path)

      assert.equal(inputs[0]?.input.originalName, 'report.pdf')
      assert.equal(inputs[0]?.input.mimeType, 'application/pdf')
      assert.deepEqual(inputs[0]?.input.body, new Uint8Array([1, 2]))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('reads a stream and prevents calls from raising the configured byte limit', async ({ assert }) => {
    const { manager } = createManager({ maxBytes: 3 })

    await assert.rejects(
      () =>
        manager.createFromStream(
          Readable.from([new Uint8Array([1, 2]), new Uint8Array([3, 4])]),
          { maxBytes: 10 }
        ),
      AttachmentSourceError
    )
  })

  test('decodes regular Base64 and data URIs', async ({ assert }) => {
    const { manager, inputs } = createManager()

    await manager.createFromBase64('data:image/png;base64,AQID', { originalName: 'avatar' })
    await manager.createFromBase64('BAUG', { originalName: 'document.pdf' })

    assert.deepEqual(inputs.map(({ input }) => input.body), [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])])
    assert.deepEqual(inputs.map(({ input }) => input.mimeType), ['image/png', 'application/pdf'])
  })

  test('rejects malformed Base64 data', async ({ assert }) => {
    const { manager } = createManager()

    await assert.rejects(
      () => manager.createFromBase64('not base64!'),
      'Attachment source must be valid Base64 data'
    )
  })

  test('downloads a URL through the injected HTTP client', async ({ assert }) => {
    const requests: Array<URL | string> = []
    const { manager, inputs } = createManager({
      async fetch(input) {
        requests.push(input)
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get(name) { return name === 'content-type' ? 'image/webp; charset=utf-8' : '3' } },
          async arrayBuffer() {
            return new Uint8Array([1, 2, 3]).buffer
          },
        }
      },
    })

    await manager.createFromUrl('https://example.test/images/cover.webp')

    assert.deepEqual(requests, ['https://example.test/images/cover.webp'])
    assert.equal(inputs[0]?.input.originalName, 'cover.webp')
    assert.equal(inputs[0]?.input.mimeType, 'image/webp')
  })

  test('creates attachments from Adonis multipart-file shaped values', async ({ assert }) => {
    const directory = await mkdtemp(join(tmpdir(), 'adonis-attachment-'))

    try {
      const path = join(directory, 'upload')
      await writeFile(path, new Uint8Array([1]))
      const { manager, inputs } = createManager()

      await manager.createFromFile({
        tmpPath: path,
        clientName: 'profile.png',
        type: 'image',
        subtype: 'png',
      })

      assert.equal(inputs[0]?.input.originalName, 'profile.png')
      assert.equal(inputs[0]?.input.mimeType, 'image/png')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('rejects multipart files without a temporary path', ({ assert }) => {
    const { manager } = createManager()

    assert.throws(
      () => manager.createFromFile({ clientName: 'profile.png' }),
      AttachmentSourceError
    )
  })
})
