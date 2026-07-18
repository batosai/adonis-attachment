import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { test } from '@japa/runner'

import {
  AttachmentManager,
  AttachmentSourceError,
  type CreateAttachmentInput,
} from '../index.js'

type CreatedAttachment = {
  id: string
  disk: string
  name: string
  originalName: string
  path: string
  size: number
  extname: string
  mimeType: string
}

function createManager(options: ConstructorParameters<typeof AttachmentManager>[1] = {}) {
  const inputs: CreateAttachmentInput[] = []
  let count = 0
  const manager = new AttachmentManager(
    {
      async create(input) {
        inputs.push(input)
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
        } as CreatedAttachment
      },
    },
    options
  )

  return { manager, inputs }
}

test.group('AttachmentManager', () => {
  test('creates an attachment from a buffer with supplied creation options', async ({ assert }) => {
    const { manager, inputs } = createManager()

    const attachment = await manager.createFromBuffer(new Uint8Array([1, 2, 3]), {
      originalName: 'avatar.jpg',
      disk: 's3',
      folder: 'users/42',
      metadata: { imported: true },
    })

    assert.equal(attachment.mimeType, 'image/jpeg')
    assert.deepEqual(inputs, [{
      body: new Uint8Array([1, 2, 3]),
      originalName: 'avatar.jpg',
      mimeType: 'image/jpeg',
      disk: 's3',
      folder: 'users/42',
      metadata: { imported: true },
    }])
  })

  test('reads a path and derives its filename and MIME type', async ({ assert }) => {
    const directory = await mkdtemp(join(tmpdir(), 'adonis-attachment-'))

    try {
      const path = join(directory, 'report.pdf')
      await writeFile(path, new Uint8Array([1, 2]))
      const { manager, inputs } = createManager()

      await manager.createFromPath(path)

      assert.equal(inputs[0]?.originalName, 'report.pdf')
      assert.equal(inputs[0]?.mimeType, 'application/pdf')
      assert.deepEqual(inputs[0]?.body, new Uint8Array([1, 2]))
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

    assert.deepEqual(inputs.map((input) => input.body), [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])])
    assert.deepEqual(inputs.map((input) => input.mimeType), ['image/png', 'application/pdf'])
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
    assert.equal(inputs[0]?.originalName, 'cover.webp')
    assert.equal(inputs[0]?.mimeType, 'image/webp')
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

      assert.equal(inputs[0]?.originalName, 'profile.png')
      assert.equal(inputs[0]?.mimeType, 'image/png')
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
