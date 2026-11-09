/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
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

test('reports broken failure callbacks without crashing or blocking subsequent jobs', async ({ assert }) => {
  // A child process catches fatal unhandled rejections without masking them in Japa.
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
    const { MemoryAttachmentQueue } = await import(${JSON.stringify(new URL('../src/queues/memory_queue.js', import.meta.url).href)})
    for (const asynchronous of [false, true]) {
      const completed = []
      const queue = new MemoryAttachmentQueue({
        async handler(job) {
          if (job.attachmentId === 'broken') throw new Error('job failed')
          completed.push(job.attachmentId)
        },
        onFailure() {
          if (asynchronous) return Promise.reject(new Error('reporter failed'))
          throw new Error('reporter failed')
        },
      })
      await queue.enqueue({ type: 'generate-variants', attachmentId: 'broken' })
      await queue.enqueue({ type: 'generate-variants', attachmentId: 'valid' })
      await queue.drain()
      console.log(JSON.stringify(completed))
    }
  `])
  assert.deepEqual(stdout.trim().split('\n'), ['["valid"]', '["valid"]'])
  assert.include(stderr, 'Attachment queue failure handler failed')
})
