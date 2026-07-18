import { test } from '@japa/runner'

import { AttachmentsController } from '../src/controllers/attachments_controller.js'

test.group('AttachmentsController', () => {
  test('returns attachment bytes with their MIME type', async ({ assert }) => {
    const headers: Record<string, string> = {}
    let body: Uint8Array | undefined
    const controller = new AttachmentsController(
      { async read() { return new Uint8Array([1, 2, 3]) } },
      {
        async findById(id) {
          assert.equal(id, 'attachment-id')
          return {
            id, disk: 'public', path: 'avatar.jpg', name: 'avatar.jpg', originalName: 'avatar.jpg',
            mimeType: 'image/jpeg', extname: 'jpg', size: 3,
          }
        },
      }
    )

    await controller.handle({
      request: { param: () => 'attachment-id' },
      response: {
        header(name: string, value: string) { headers[name] = value },
        send(value: Uint8Array) { body = value },
        notFound() { throw new Error('not found') },
      },
    } as never)

    assert.equal(headers['content-type'], 'image/jpeg')
    assert.deepEqual(body, new Uint8Array([1, 2, 3]))
  })
})
