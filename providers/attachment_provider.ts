/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'
import type { AttachmentManager } from '../src/attachment_manager.js'
import type { ResolvedAttachmentConfig } from '../src/types/config.js'

import { configProvider } from '@adonisjs/core'
import { RuntimeException } from '@poppinss/utils'

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

      const attachmentConfig = this.app.config.get<ResolvedAttachmentConfig>('attachment')
      const config = await configProvider.resolve<ResolvedAttachmentConfig>(
        this.app,
        attachmentConfig
      )
      const logger = await this.app.container.make('logger')
      const drive = await this.app.container.make('drive.manager')

      if (!config) {
        throw new RuntimeException(
          'Invalid config exported from "config/attachment.ts" file. Make sure to use the defineConfig method'
        )
      }

      this.#manager = new AttachmentManager(config, logger, drive)

      return this.#manager
    })
  }
}
