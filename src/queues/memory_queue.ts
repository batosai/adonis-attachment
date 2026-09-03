/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentJob, AttachmentJobHandler, AttachmentQueue } from '../core/queue.js'
import { AttachmentError } from '../errors.js'

export type AttachmentQueueFailureHandler = (
  job: AttachmentJob,
  error: unknown
) => void | Promise<void>

export type MemoryAttachmentQueueOptions = {
  handler: AttachmentJobHandler
  concurrency?: number
  onFailure?: AttachmentQueueFailureHandler
}

/**
 * In-process default queue for local development and applications without a worker.
 */
export class MemoryAttachmentQueue implements AttachmentQueue {
  readonly #handler: AttachmentJobHandler
  readonly #onFailure: AttachmentQueueFailureHandler | undefined
  readonly #concurrency: number
  readonly #pending: AttachmentJob[] = []
  #active = 0
  #drainWaiters: Array<() => void> = []

  constructor(options: MemoryAttachmentQueueOptions) {
    if (!Number.isInteger(options.concurrency ?? 1) || (options.concurrency ?? 1) < 1) {
      throw new AttachmentError('Memory queue concurrency must be a positive integer', {
        code: 'E_INVALID_QUEUE_CONCURRENCY',
      })
    }

    this.#handler = options.handler
    this.#onFailure = options.onFailure
    this.#concurrency = options.concurrency ?? 1
  }

  async enqueue(job: AttachmentJob): Promise<void> {
    this.#pending.push(job)
    this.#process()
  }

  async drain(): Promise<void> {
    if (this.#pending.length === 0 && this.#active === 0) {
      return
    }

    await new Promise<void>((resolve) => this.#drainWaiters.push(resolve))
  }

  #process(): void {
    while (this.#active < this.#concurrency) {
      const job = this.#pending.shift()

      if (!job) {
        this.#resolveDrainWaiters()
        return
      }

      this.#active += 1
      void this.#run(job)
    }
  }

  async #run(job: AttachmentJob): Promise<void> {
    try {
      await this.#handler(job)
    } catch (error) {
      await this.#onFailure?.(job, error)
    } finally {
      this.#active -= 1
      this.#process()
    }
  }

  #resolveDrainWaiters(): void {
    if (this.#active !== 0 || this.#pending.length !== 0) {
      return
    }

    const waiters = this.#drainWaiters
    this.#drainWaiters = []
    waiters.forEach((resolve) => resolve())
  }
}
