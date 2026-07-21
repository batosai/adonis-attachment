/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { configProvider } from '@adonisjs/core'
import { MemoryAttachmentQueue } from './queues/memory_queue.js'
import {
  resolveAttachmentTableNames,
  type AttachmentTableNames,
} from './integrations/lucid/attachment_table_names.js'

import type { ApplicationService, ConfigProvider } from '@adonisjs/core/types'
import type { AttachmentServiceOptions } from './core/attachment_service.js'
import type { AttachmentJobProcessor } from './core/attachment_job_processor.js'
import type { AttachmentRepository } from './core/attachment_repository.js'
import type { AttachmentJobHandler, AttachmentQueue } from './core/queue.js'
import type { AttachmentStorage } from './core/storage.js'
import type { AttachmentManagerOptions } from './sources/attachment_manager.js'
import type { AttachmentPersistenceOptions } from './core/attachment_options.js'

type Integration<T> = T | ((app: ApplicationService) => T | Promise<T>)

export type AttachmentRouteConfig = false | { prefix?: string }

export type ResolvedAttachmentRouteConfig = {
  path: string
}

export type LucidAttachmentConfig = {
  /** Blob table name. The link table is derived as `${singular(tableName)}_links`. */
  tableName?: string
}

export type AttachmentIntegrationsConfig = {
  /** Optional configuration for the Lucid persistence integration. */
  lucid?: LucidAttachmentConfig
}

export type AttachmentConfig = {
  /** Overrides the storage default. Falls back to `fs` when no adapter provides one. */
  defaultDisk?: string
  storage: Integration<AttachmentStorage>
  queue?: Integration<AttachmentQueue>
  jobHandler?: Integration<AttachmentJobHandler>
  processor?: Integration<AttachmentJobProcessor>
  repository?: Integration<AttachmentRepository>
  /** Lowest-priority defaults for file persistence. */
  defaults?: AttachmentPersistenceOptions
  sources?: AttachmentManagerOptions
  route?: AttachmentRouteConfig
  integrations?: AttachmentIntegrationsConfig
  queueConcurrency?: number
  createId?: () => string
}

export type ResolvedAttachmentConfig = AttachmentServiceOptions & {
  repository?: AttachmentRepository
  defaults?: AttachmentPersistenceOptions
  sources?: AttachmentManagerOptions
  route: ResolvedAttachmentRouteConfig | false
  integrations?: {
    lucid?: AttachmentTableNames
  }
}

/**
 * Defers resolution of optional Adonis integrations until application boot.
 */
export function defineConfig(config: AttachmentConfig): ConfigProvider<ResolvedAttachmentConfig> {
  return configProvider.create(async (app) => {
    const storage = await resolveIntegration(config.storage, app)
    const processor = config.processor
      ? await resolveIntegration(config.processor, app)
      : undefined
    const queue = config.queue
      ? await resolveIntegration(config.queue, app)
      : new MemoryAttachmentQueue({
          handler: config.jobHandler
            ? await resolveIntegration(config.jobHandler, app)
            : processor
              ? (job) => processor.process(job)
            : async () => {},
          ...(config.queueConcurrency ? { concurrency: config.queueConcurrency } : {}),
        })

    return {
      defaultDisk: config.defaultDisk ?? storage.defaultDisk ?? 'fs',
      storage,
      queue,
      route: resolveRoute(config.route),
      ...(config.repository
        ? { repository: await resolveIntegration(config.repository, app) }
        : {}),
      ...(config.defaults ? { defaults: config.defaults } : {}),
      ...(config.sources ? { sources: config.sources } : {}),
      ...(config.integrations?.lucid
        ? {
            integrations: {
              lucid: resolveAttachmentTableNames(config.integrations.lucid.tableName),
            },
          }
        : {}),
      ...(config.createId ? { createId: config.createId } : {}),
    }
  })
}

function resolveRoute(route: AttachmentRouteConfig | undefined): ResolvedAttachmentRouteConfig | false {
  if (route === false) {
    return false
  }

  const prefix = route?.prefix ?? '/attachments'

  if (!prefix.startsWith('/') || prefix.includes(':')) {
    throw new Error('Attachment route prefix must start with "/" and cannot contain parameters')
  }

  return { path: `${prefix.replace(/\/+$/, '') || ''}/:id` }
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
