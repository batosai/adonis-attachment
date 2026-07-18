import type { ApplicationService, ConfigProvider } from '@adonisjs/core/types'

import { configProvider } from '@adonisjs/core'
import type { AttachmentServiceOptions } from './core/attachment_service.js'
import type { AttachmentQueue } from './core/queue.js'
import type { AttachmentStorage } from './core/storage.js'

type Integration<T> = T | ((app: ApplicationService) => T | Promise<T>)

export type AttachmentConfig = {
  defaultDisk: string
  storage: Integration<AttachmentStorage>
  queue: Integration<AttachmentQueue>
  createId?: () => string
}

export type ResolvedAttachmentConfig = AttachmentServiceOptions

/**
 * Defers resolution of optional Adonis integrations until application boot.
 */
export function defineConfig(config: AttachmentConfig): ConfigProvider<ResolvedAttachmentConfig> {
  return configProvider.create(async (app) => ({
    defaultDisk: config.defaultDisk,
    storage: await resolveIntegration(config.storage, app),
    queue: await resolveIntegration(config.queue, app),
    ...(config.createId ? { createId: config.createId } : {}),
  }))
}

async function resolveIntegration<T>(
  integration: Integration<T>,
  app: ApplicationService
): Promise<T> {
  if (typeof integration === 'function') {
    return (integration as (application: ApplicationService) => T | Promise<T>)(app)
  }

  return integration
}
