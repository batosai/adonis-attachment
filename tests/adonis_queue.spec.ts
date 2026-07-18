import { test } from '@japa/runner'

import { AdonisAttachmentQueue } from '../index.js'

test.group('AdonisAttachmentQueue', () => {
  test('dispatches an attachment job to the configured queue', async ({ assert }) => {
    const calls: string[] = []
    const queue = new AdonisAttachmentQueue({
      queue: 'attachments',
      job: {
        dispatch(payload) {
          calls.push(`dispatch:${payload.attachmentId}`)
          return {
            toQueue(name) {
              calls.push(`queue:${name}`)
              return this
            },
            async run() {
              calls.push('run')
            },
          }
        },
      },
    })

    await queue.enqueue({ type: 'generate-variants', attachmentId: 'attachment-id' })

    assert.deepEqual(calls, ['dispatch:attachment-id', 'queue:attachments', 'run'])
  })

  test('uses the job default queue when no queue name is configured', async ({ assert }) => {
    const calls: string[] = []
    const queue = new AdonisAttachmentQueue({
      job: {
        dispatch() {
          return {
            toQueue() {
              throw new Error('should not select a queue')
            },
            async run() {
              calls.push('run')
            },
          }
        },
      },
    })

    await queue.enqueue({ type: 'generate-variants', attachmentId: 'attachment-id' })

    assert.deepEqual(calls, ['run'])
  })
})
