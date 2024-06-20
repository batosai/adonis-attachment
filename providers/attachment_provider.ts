/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'
import type { AttachmentManager } from '../src/attachment_manager.js'

declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    'jrmc.attachment': AttachmentManager
  }
}

export default class AttachmentProvider {
  #manager: AttachmentManager | null = null

  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('jrmc.attachment', async () => {
      const { AttachmentManager } = await import('../src/attachment_manager.js')

      // const config = this.app.config.get<QueueConfig>('queue')
      const logger = await this.app.container.make('logger')

      this.#manager = new AttachmentManager(logger, this.app)

      return this.#manager
    })
  }
}
