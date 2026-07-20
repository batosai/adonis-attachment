/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'
import { setApp } from '@adonisjs/core/services/app'
import type { ApplicationService } from '@adonisjs/core/types'

import { attachmentManager } from '../index.js'
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
})
