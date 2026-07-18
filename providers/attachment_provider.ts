import type { ApplicationService } from '@adonisjs/core/types'

import { configProvider } from '@adonisjs/core'
import { AttachmentService } from '../src/core/attachment_service.js'
import type { AttachmentRepository } from '../src/core/attachment_repository.js'
import { AttachmentsController } from '../src/controllers/attachments_controller.js'
import type { ResolvedAttachmentConfig } from '../src/define_config.js'
import { AttachmentManager } from '../src/sources/attachment_manager.js'

declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    'jrmc.attachment': AttachmentService
    'jrmc.attachment.manager': AttachmentManager
    'jrmc.attachment.repository': AttachmentRepository
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

    this.app.container.singleton('jrmc.attachment.repository', async () => {
      const attachmentConfig = this.app.config.get('attachment')
      const config = await configProvider.resolve<ResolvedAttachmentConfig>(
        this.app,
        attachmentConfig
      )

      if (!config?.repository) {
        throw new Error('Attachment routes require a repository in config/attachment.ts')
      }

      return config.repository
    })

    this.app.container.singleton('jrmc.attachment.manager', async () => {
      const attachmentConfig = this.app.config.get('attachment')
      const config = await configProvider.resolve<ResolvedAttachmentConfig>(
        this.app,
        attachmentConfig
      )
      const attachments = await this.app.container.make('jrmc.attachment')

      return new AttachmentManager(attachments, config?.sources)
    })
  }

  async boot(): Promise<void> {
    const attachmentConfig = this.app.config.get('attachment')
    const config = await configProvider.resolve<ResolvedAttachmentConfig>(this.app, attachmentConfig)

    if (!config || config.route === false || !config.repository) {
      return
    }

    const router = await this.app.container.make('router')
    router.get(config.route.path, async (context) => {
      const attachments = await this.app.container.make('jrmc.attachment')
      const repository = await this.app.container.make('jrmc.attachment.repository')

      return new AttachmentsController(attachments, repository).handle(context)
    })
  }
}
