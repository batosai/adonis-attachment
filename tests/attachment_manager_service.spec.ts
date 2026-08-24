/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'
import { setApp } from '@adonisjs/core/services/app'
import type { ApplicationService } from '@adonisjs/core/types'

import { attachmentManager, attachmentService } from '../index.js'
import { AttachmentDraft } from '../src/core/attachment.js'
import { AttachmentManager } from '../src/sources/attachment_manager.js'

test.group('attachmentManager service', () => {
  test('resolves the typed manager lazily from the Adonis container', async ({ assert }) => {
    const manager = new AttachmentManager({
      createDraft(input) {
        return {
          id: 'attachment-id',
          disk: input.disk ?? 'fs',
          name: input.originalName,
          path: input.originalName,
          originalName: input.originalName,
          size: input.body.byteLength,
          extname: '.txt',
          mimeType: input.mimeType ?? 'application/octet-stream',
          isPersisted: false,
        } as AttachmentDraft
      },
    })

    setApp({
      booted(callback: Parameters<ApplicationService['booted']>[0]) {
        return callback(this as never)
      },
      container: {
        async make(binding: string) {
          assert.equal(binding, 'jrmc.attachment.manager')
          return manager
        },
      },
    } as never)

    const attachment = await attachmentManager.createFromBuffer(Buffer.from('file'), {
      originalName: 'file.txt',
      mimeType: 'text/plain',
    })

    assert.equal(attachment.originalName, 'file.txt')
    assert.equal(attachment.mimeType, 'text/plain')
  })

  test('resolves the typed attachment service lazily from the Adonis container', async ({ assert }) => {
    const service = {
      async getUrl() {
        return 'https://cdn.example.test/file.txt'
      },
    }

    setApp({
      booted(callback: Parameters<ApplicationService['booted']>[0]) {
        return callback(this as never)
      },
      container: {
        async make(binding: string) {
          assert.equal(binding, 'jrmc.attachment')
          return service
        },
      },
    } as never)

    const url = await attachmentService.getUrl({
      id: 'attachment-id',
      disk: 'fs',
      name: 'file.txt',
      path: 'file.txt',
      originalName: 'file.txt',
      size: 4,
      extname: 'txt',
      mimeType: 'text/plain',
    })

    assert.equal(url, 'https://cdn.example.test/file.txt')
  })
})
