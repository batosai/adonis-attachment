/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'
import type {
  AttachmentJob,
  AttachmentQueue,
  AttachmentQueueContext,
  AttachmentQueueDispatchContext,
} from '../core/queue.js'
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
  queueName?:
    | string
    | ((job: AttachmentJob, context: AttachmentQueueDispatchContext) => string | undefined)
}

/**
 * Dispatches attachment jobs through an application-defined @adonisjs/queue Job class.
 */
export class AdonisAttachmentQueue implements AttachmentQueue {
  readonly #job: AdonisAttachmentJob
  readonly #queueName: AdonisAttachmentQueueOptions['queueName']
  #dependency: Promise<unknown> | undefined

  /** A forwarding job is application-specific and must be supplied explicitly. */
  static configure(options: AdonisAttachmentQueueOptions) {
    return (_app: ApplicationService, _context: AttachmentQueueContext): AdonisAttachmentQueue =>
      new AdonisAttachmentQueue(options)
  }

  constructor(options: AdonisAttachmentQueueOptions) {
    if (!options.job || typeof options.job.dispatch !== 'function') {
      throw new AttachmentConfigurationError(
        'The Adonis attachment queue requires a job with a dispatch method'
      )
    }

    this.#job = options.job
    this.#queueName = options.queueName
  }

  async enqueue(job: AttachmentJob, context?: AttachmentQueueDispatchContext): Promise<void> {
    this.#dependency ??= loadOptionalDependency('@adonisjs/queue')
    await this.#dependency

    let destination: string | undefined
    if (!this.#job.options?.queue) {
      const mimeType = context?.mimeType
        ?? (job.type === 'extract-metadata' ? job.attachment.mimeType : undefined)
      destination = typeof this.#queueName === 'function'
        ? this.#queueName(job, mimeType === undefined ? {} : { mimeType })
        : this.#queueName
    }

    const dispatcher = this.#job.dispatch(job)
    await (destination ? dispatcher.toQueue(destination) : dispatcher).run()
  }
}
