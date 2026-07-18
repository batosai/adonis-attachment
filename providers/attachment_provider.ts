import type { ApplicationService } from '@adonisjs/core/types'

import { configProvider } from '@adonisjs/core'
import { AttachmentService } from '../src/core/attachment_service.js'
import type { ResolvedAttachmentConfig } from '../src/define_config.js'

declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    'jrmc.attachment': AttachmentService
  }
}

export default class AttachmentProvider {
  constructor(protected app: ApplicationService) {}

  register(): void {
    this.app.container.singleton('jrmc.attachment', async () => {
      const attachmentConfig = this.app.config.get('attachment')
      const config = await configProvider.resolve<ResolvedAttachmentConfig>(
        this.app,
        attachmentConfig
      )

      if (!config) {
        throw new Error(
          'Invalid attachment config. Export the result of defineConfig from config/attachment.ts'
        )
      }

      return new AttachmentService(config)
    })
  }
}
