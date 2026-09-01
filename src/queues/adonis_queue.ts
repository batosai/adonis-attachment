/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentJob, AttachmentQueue } from '../core/queue.js'
import { loadOptionalDependency } from '../utils/optional_dependency.js'

export type AdonisQueueDispatcher = {
  toQueue(name: string): AdonisQueueDispatcher
  run(): Promise<unknown>
}

export type AdonisAttachmentJob = {
  dispatch(payload: AttachmentJob): AdonisQueueDispatcher
}

export type AdonisAttachmentQueueOptions = {
  job: AdonisAttachmentJob
  queue?: string
}

/**
 * Dispatches attachment jobs through an application-defined @adonisjs/queue Job class.
 */
export class AdonisAttachmentQueue implements AttachmentQueue {
  readonly #job: AdonisAttachmentJob
  readonly #queue: string | undefined
  #dependency: Promise<unknown> | undefined

  constructor(options: AdonisAttachmentQueueOptions) {
    this.#job = options.job
    this.#queue = options.queue
  }

  async enqueue(job: AttachmentJob): Promise<void> {
    this.#dependency ??= loadOptionalDependency('@adonisjs/queue')
    await this.#dependency

    const dispatcher = this.#job.dispatch(job)
    await (this.#queue ? dispatcher.toQueue(this.#queue) : dispatcher).run()
  }
}
