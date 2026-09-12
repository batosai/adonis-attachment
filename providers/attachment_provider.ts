/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { configProvider } from '@adonisjs/core'
import { AttachmentService } from '../src/core/attachment_service.js'
import { AttachmentsController } from '../src/controllers/attachments_controller.js'
import { AttachmentManager } from '../src/sources/attachment_manager.js'
import { AdonisAttachmentEventEmitter } from '../src/events/adonis_attachment_event_emitter.js'
import { loadOptionalDependency } from '../src/utils/optional_dependency.js'

import type { ApplicationService } from '@adonisjs/core/types'
import type { ResolvedAttachmentConfig } from '../src/define_config.js'

export default class AttachmentProvider {
  constructor(protected app: ApplicationService) {}

  register(): void {
    this.app.container.singleton('jrmc.attachment.processingAdapters', async () => {
      const config = await configProvider.resolve<ResolvedAttachmentConfig>(this.app, this.app.config.get('attachment'))
      return config?.processingAdapters ?? {}
    })
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

      await applyLucidConfig(config)

      const events = await this.app.container.make('jrmc.attachment.events')
      return new AttachmentService({ ...config, events })
    })

    this.app.container.singleton('jrmc.attachment.events', async () => {
      const attachmentConfig = this.app.config.get('attachment')
      const config = await configProvider.resolve<ResolvedAttachmentConfig>(
        this.app,
        attachmentConfig
      )

      if (config?.events) {
        return config.events
      }

      const { default: emitter } = await import('@adonisjs/core/services/emitter')
      return new AdonisAttachmentEventEmitter(emitter)
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

      await applyLucidConfig(config)

      return config.repository
    })

    this.app.container.singleton('jrmc.attachment.manager', async () => {
      const attachmentConfig = this.app.config.get('attachment')
      const config = await configProvider.resolve<ResolvedAttachmentConfig>(
        this.app,
        attachmentConfig
      )
      if (config) {
        await applyLucidConfig(config)
      }
      const attachments = await this.app.container.make('jrmc.attachment')

      return new AttachmentManager(attachments, config?.sources)
    })

    this.app.container.singleton('jrmc.attachment.converters', async () => {
      const attachmentConfig = this.app.config.get('attachment')
      const config = await configProvider.resolve<ResolvedAttachmentConfig>(
        this.app,
        attachmentConfig
      )

      if (!config?.converters) {
        throw new Error('Attachment converters require a converters entry in config/attachment.ts')
      }

      return config.converters
    })
  }

  async boot(): Promise<void> {
    const attachmentConfig = this.app.config.get('attachment')
    const config = await configProvider.resolve<ResolvedAttachmentConfig>(
      this.app,
      attachmentConfig
    )

    if (config) {
      await applyLucidConfig(config)
    }

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

async function applyLucidConfig(config: ResolvedAttachmentConfig): Promise<void> {
  const lucid = config.integrations?.lucid

  if (!lucid) {
    return
  }

  const { configureLucidAttachmentTables } = await loadOptionalDependency(
    '@adonisjs/lucid',
    () => import('../src/integrations/lucid/schema/configure_lucid_attachment_tables.js')
  )
  configureLucidAttachmentTables(lucid.tableName)
}
