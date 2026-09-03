/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentJob, AttachmentQueue } from '../core/queue.js'
import { AttachmentConfigurationError } from '../errors.js'
import { loadOptionalDependency } from '../utils/optional_dependency.js'

export type AdonisQueueDispatcher = {
  toQueue(name: string): AdonisQueueDispatcher
  run(): Promise<unknown>
}

export type AdonisAttachmentJob = {
  options?: {
    queue?: string
  }
  dispatch(payload: AttachmentJob): AdonisQueueDispatcher
}

export type AdonisAttachmentQueueOptions = {
  job: AdonisAttachmentJob
  queueName?: string
}

/**
 * Dispatches attachment jobs through an application-defined @adonisjs/queue Job class.
 */
export class AdonisAttachmentQueue implements AttachmentQueue {
  readonly #job: AdonisAttachmentJob
  readonly #queueName: string | undefined
  #dependency: Promise<unknown> | undefined

  constructor(options: AdonisAttachmentQueueOptions) {
    if (!options.job || typeof options.job.dispatch !== 'function') {
      throw new AttachmentConfigurationError(
        'The Adonis attachment queue requires a job with a dispatch method'
      )
    }

    this.#job = options.job
    this.#queueName = options.queueName
  }

  async enqueue(job: AttachmentJob): Promise<void> {
    this.#dependency ??= loadOptionalDependency('@adonisjs/queue')
    await this.#dependency

    const dispatcher = this.#job.dispatch(job)
    const hasJobQueue = Boolean(this.#job.options?.queue)
    await (!hasJobQueue && this.#queueName ? dispatcher.toQueue(this.#queueName) : dispatcher).run()
  }
}
