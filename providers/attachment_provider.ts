/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'

import { configProvider } from '@adonisjs/core'
import { RuntimeException } from '@poppinss/utils'
import type { AttachmentService } from '../src/types/config.js'

declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    'jrmc.attachment': AttachmentService
  }
}

export default class AttachmentProvider {
  #manager: AttachmentService | null = null

  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('jrmc.attachment', async () => {
      const { AttachmentManager } = await import('../src/attachment_manager.js')

      const attachmentConfig = this.app.config.get<any>('attachment')
      const config = await configProvider.resolve<any>(this.app, attachmentConfig)
      const drive = await this.app.container.make('drive.manager')

      if (!config) {
        throw new RuntimeException(
          'Invalid config exported from "config/attachment.ts" file. Make sure to use the defineConfig method'
        )
      }

      this.#manager = new AttachmentManager(config, drive)

      return this.#manager
    })
  }
}
