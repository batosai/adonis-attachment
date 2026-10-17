/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'
import type { AttachmentJob, AttachmentJobHandler, AttachmentQueue, AttachmentQueueContext } from '../core/queue.js'
import { AttachmentError, AttachmentProcessorNotConfiguredError } from '../errors.js'

const configuredQueues = new WeakSet<AttachmentQueue>()

/** @internal Identifies queues whose handler is supplied by attachment configuration. */
export function isConfiguredMemoryAttachmentQueue(queue: AttachmentQueue): boolean {
  return configuredQueues.has(queue)
}

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

  static fromApp(app: ApplicationService, context: AttachmentQueueContext): MemoryAttachmentQueue {
    return MemoryAttachmentQueue.configure()(app, context)
  }

  static configure(options: Omit<MemoryAttachmentQueueOptions, 'handler'> = {}) {
    return (_app: ApplicationService, context: AttachmentQueueContext): MemoryAttachmentQueue => {
      const queue = context.handler
        ? new MemoryAttachmentQueue({ ...options, handler: context.handler })
        : new UnconfiguredMemoryAttachmentQueue(options)
      configuredQueues.add(queue)
      return queue
    }
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

/** Keep missing processing configuration visible at enqueue time. */
class UnconfiguredMemoryAttachmentQueue extends MemoryAttachmentQueue {
  constructor(options: Omit<MemoryAttachmentQueueOptions, 'handler'>) {
    super({ ...options, handler: async () => {} })
  }

  override enqueue(): Promise<void> {
    return Promise.reject(new AttachmentProcessorNotConfiguredError())
  }
}
