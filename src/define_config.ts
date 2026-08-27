/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { configProvider } from '@adonisjs/core'
import { MemoryAttachmentQueue } from './queues/memory_queue.js'
import { AttachmentError } from './errors.js'
import {
  resolveAttachmentTableNames,
  type AttachmentTableNames,
} from './integrations/lucid/schema/attachment_table_names.js'

import type { ApplicationService, ConfigProvider } from '@adonisjs/core/types'
import type { AttachmentServiceOptions } from './core/attachment_service.js'
import type { AttachmentMetadataMode } from './core/attachment_service.js'
import type { AttachmentMetadataPersister } from './core/attachment_metadata_persister.js'
import type { AttachmentJobProcessor } from './core/attachment_job_processor.js'
import type { AttachmentRepository } from './core/attachment_repository.js'
import type { AttachmentJobHandler, AttachmentQueue } from './core/queue.js'
import type { AttachmentStorage } from './core/storage.js'
import type { AttachmentManagerOptions } from './sources/attachment_manager.js'
import type { AttachmentPersistenceOptions } from './core/attachment_options.js'
import type { MediaMetadataExtractor } from './media/media_metadata.js'
import type { AttachmentBinariesConfig } from './media/binary_config.js'
import type { AttachmentEventEmitter } from './events/attachment_events.js'
import {
  ConfiguredVariantConverterRegistry,
  type ConverterConfigMap,
  type VariantConverterRegistry,
} from './converters/configured_variant_converter_registry.js'

type Integration<T> = T | ((app: ApplicationService) => T | Promise<T>)

export type AttachmentRouteConfig = false | {
  prefix?: string
  /** Adds an optional, human-readable filename segment after the attachment id. */
  includeName?: boolean
}

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

export type AttachmentMediaConfig = {
  /** Shared executable paths and timeouts for the built-in media adapters. */
  binaries?: AttachmentBinariesConfig
  /** Extracts technical metadata when a persistence option enables `meta`. */
  metadata?: Integration<readonly MediaMetadataExtractor[]>
  metadataPolicy?: {
    mode?: AttachmentMetadataMode
    variants?: boolean
  }
  metadataPersister?: Integration<AttachmentMetadataPersister>
}

/** Optional application event emitter used for attachment lifecycle events. */
export type AttachmentEventsConfig = Integration<AttachmentEventEmitter>

/** v5-style named converter declarations, resolved lazily when a job needs one. */
export type AttachmentConvertersConfig = ConverterConfigMap

export type AttachmentConfig<KnownConverters extends ConverterConfigMap = ConverterConfigMap> = {
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
  media?: AttachmentMediaConfig
  events?: AttachmentEventsConfig
  converters?: KnownConverters
  queueConcurrency?: number
  createId?: () => string
}

export type ResolvedAttachmentConfig<KnownConverters extends ConverterConfigMap = ConverterConfigMap> = AttachmentServiceOptions & {
  repository?: AttachmentRepository
  defaults?: AttachmentPersistenceOptions
  sources?: AttachmentManagerOptions
  route: ResolvedAttachmentRouteConfig | false
  integrations?: {
    lucid?: AttachmentTableNames
  }
  converters?: VariantConverterRegistry<Extract<keyof KnownConverters, string>>
}

/** Extracts the converter map from a config returned by `defineConfig`. */
export type InferConverters<Config> = Config extends ConfigProvider<
  ResolvedAttachmentConfig<infer KnownConverters>
>
  ? KnownConverters
  : never

/**
 * Defers resolution of optional Adonis integrations until application boot.
 */
export function defineConfig<const KnownConverters extends ConverterConfigMap = {}>(
  config: AttachmentConfig<KnownConverters>
): ConfigProvider<ResolvedAttachmentConfig<KnownConverters>> {
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

    const metadataExtractors = config.media?.metadata
      ? await resolveIntegration(config.media.metadata, app)
      : undefined
    const metadataPersister = config.media?.metadataPersister
      ? await resolveIntegration(config.media.metadataPersister, app)
      : undefined
    const resolvedMetadataPersister = metadataPersister
      ?? await resolveLucidMetadataPersister(config.media?.metadataPolicy?.mode, config.integrations?.lucid)
    const events = config.events ? await resolveIntegration(config.events, app) : undefined

    if (processor && events) {
      processor.setEventEmitter(events)
    }

    if (config.media?.metadataPolicy?.mode === 'deferred' && !resolvedMetadataPersister) {
      throw new AttachmentError(
        'Deferred metadata extraction requires media.metadataPersister or integrations.lucid',
        { code: 'E_INVALID_ATTACHMENT_CONFIG' }
      )
    }

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
      ...(metadataExtractors ? { metadataExtractors } : {}),
      ...(config.media?.metadataPolicy?.mode ? { metadataMode: config.media.metadataPolicy.mode } : {}),
      ...(config.media?.metadataPolicy?.variants !== undefined ? { metadataVariants: config.media.metadataPolicy.variants } : {}),
      ...(resolvedMetadataPersister ? { metadataPersister: resolvedMetadataPersister } : {}),
      ...(events ? { events } : {}),
      ...(config.converters
        ? {
            converters: new ConfiguredVariantConverterRegistry(config.converters, {
              autodetect: toAutodetectOptions(config.media?.binaries),
            }),
          }
        : {}),
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

function toAutodetectOptions(binaries: AttachmentBinariesConfig | undefined) {
  return {
    ...(binaries?.ffmpeg?.command ? { ffmpegCommand: binaries.ffmpeg.command } : {}),
    ...(binaries?.ffmpeg?.timeout !== undefined ? { ffmpegTimeout: binaries.ffmpeg.timeout } : {}),
    ...(binaries?.pdftoppm?.command ? { pdftoppmCommand: binaries.pdftoppm.command } : {}),
    ...(binaries?.pdftoppm?.timeout !== undefined ? { pdftoppmTimeout: binaries.pdftoppm.timeout } : {}),
    ...(binaries?.soffice?.command ? { officeCommand: binaries.soffice.command } : {}),
    ...(binaries?.soffice?.timeout !== undefined ? { officeTimeout: binaries.soffice.timeout } : {}),
  }
}

async function resolveLucidMetadataPersister(
  mode: AttachmentMetadataMode | undefined,
  lucid: LucidAttachmentConfig | undefined
): Promise<AttachmentMetadataPersister | undefined> {
  if (mode !== 'deferred' || !lucid) {
    return undefined
  }

  const { LucidAttachmentMetadataPersister } =
    await import('./integrations/lucid/persistence/lucid_attachment_metadata_persister.js')
  return new LucidAttachmentMetadataPersister()
}

function resolveRoute(route: AttachmentRouteConfig | undefined): ResolvedAttachmentRouteConfig | false {
  if (route === false) {
    return false
  }

  const prefix = route?.prefix ?? '/attachments'

  if (!prefix.startsWith('/') || prefix.includes(':')) {
    throw new AttachmentError('Attachment route prefix must start with "/" and cannot contain parameters', {
      code: 'E_INVALID_ATTACHMENT_ROUTE',
    })
  }

  return { path: `${prefix.replace(/\/+$/, '') || ''}/:id${route?.includeName ? '/:name?' : ''}` }
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
