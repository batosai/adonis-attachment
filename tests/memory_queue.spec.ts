/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { MemoryAttachmentQueue } from '../index.js'

test('processes queued jobs up to its configured concurrency', async ({ assert }) => {
  let active = 0
  let maximumActive = 0
  const completed: string[] = []
  const queue = new MemoryAttachmentQueue({
    concurrency: 2,
    async handler(job) {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      completed.push(job.attachmentId)
      active -= 1
    },
  })

  await Promise.all([
    queue.enqueue({ type: 'generate-variants', attachmentId: 'one' }),
    queue.enqueue({ type: 'generate-variants', attachmentId: 'two' }),
    queue.enqueue({ type: 'generate-variants', attachmentId: 'three' }),
  ])
  await queue.drain()

  assert.equal(maximumActive, 2)
  assert.deepEqual(completed.sort(), ['one', 'three', 'two'])
})

test('reports failures and continues with subsequent jobs', async ({ assert }) => {
  const failures: string[] = []
  const completed: string[] = []
  const queue = new MemoryAttachmentQueue({
    async handler(job) {
      if (job.attachmentId === 'broken') {
        throw new Error('conversion failed')
      }
      completed.push(job.attachmentId)
    },
    onFailure(job) {
      failures.push(job.attachmentId)
    },
  })

  await queue.enqueue({ type: 'generate-variants', attachmentId: 'broken' })
  await queue.enqueue({ type: 'generate-variants', attachmentId: 'valid' })
  await queue.drain()

  assert.deepEqual(failures, ['broken'])
  assert.deepEqual(completed, ['valid'])
})
