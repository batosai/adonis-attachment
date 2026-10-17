/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { configProvider } from '@adonisjs/core'
import {
  MemoryAttachmentQueue,
  isConfiguredMemoryAttachmentQueue,
  type AttachmentQueueFailureHandler,
} from './queues/memory_queue.js'
import {
  AdonisAttachmentQueue,
  type AdonisAttachmentJob,
} from './queues/adonis_queue.js'
import {
  AttachmentError,
  AttachmentConfigurationError,
} from './errors.js'
import type { ApplicationService, ConfigProvider } from '@adonisjs/core/types'
import type { AttachmentServiceOptions } from './core/attachment_service.js'
import type { AttachmentMetadataMode } from './core/attachment_service.js'
import type { AttachmentRepository } from './core/attachment_repository.js'
import type { AttachmentProcessingAdapters } from './core/attachment_processing_adapter.js'
import type { AttachmentStore, AttachmentStoreConfig, AttachmentStoreContext } from './core/attachment_store.js'
import { hasAttachmentTransactions } from './core/attachment_persistence.js'
import { createAttachmentProcessor } from './create_attachment_processor.js'
import type { AttachmentJobHandler, AttachmentQueue, AttachmentQueueAdapterConfig, AttachmentQueueContext } from './core/queue.js'
import type { AttachmentStorageConfig, AttachmentStorageContext } from './core/storage.js'
import type { AttachmentManagerOptions } from './sources/attachment_manager.js'
import type { VariantPathOptions } from './variants/variant_path.js'
import type { AttachmentPersistenceOptions } from './core/attachment_options.js'
import type { MediaMetadataExtractor } from './media/media_metadata.js'
import type { AttachmentBinariesConfig } from './media/binary_config.js'
import type { AttachmentEventEmitter } from './events/attachment_events.js'
import { createDefaultMetadataExtractors } from './media/default_metadata.js'
import {
  ConfiguredVariantConverterRegistry,
  type ConverterConfigMap,
  type VariantConverterRegistry,
} from './converters/configured_variant_converter_registry.js'

type Integration<T> = T | ((app: ApplicationService) => T | Promise<T>)

export type AttachmentRouteConfig = false | { prefix?: string }

export type ResolvedAttachmentRouteConfig = {
  path: string
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
}

/** Optional application event emitter used for attachment lifecycle events. */
export type AttachmentEventsConfig = Integration<AttachmentEventEmitter>

/** v5-style named converter declarations, resolved lazily when a job needs one. */
export type AttachmentConvertersConfig = ConverterConfigMap

export type MemoryAttachmentQueueConfig = {
  driver: 'memory'
  concurrency?: number
  onFailure?: AttachmentQueueFailureHandler
}

export type AdonisAttachmentQueueConfig = {
  driver: 'adonis'
  job: AdonisAttachmentJob
  queueName?: string
}

export type AttachmentQueueConfig =
  | MemoryAttachmentQueueConfig
  | AdonisAttachmentQueueConfig

export type AttachmentQueueConnection = AttachmentQueueConfig | AttachmentQueueAdapterConfig

export type AttachmentQueueConnections = Record<string, AttachmentQueueConnection>

export type NamedAttachmentQueueConfig<Connections extends AttachmentQueueConnections = AttachmentQueueConnections> = {
  default: NoInfer<Extract<keyof Connections, string>>
  connections: Connections
}

export type AttachmentConfig<
  KnownConverters extends ConverterConfigMap = ConverterConfigMap,
  KnownQueues extends AttachmentQueueConnections = AttachmentQueueConnections,
> = {
  /** Overrides the storage default. Falls back to `fs` when no adapter provides one. */
  defaultDisk?: string
  storage: AttachmentStorageConfig
  queue?: AttachmentQueueConnection | NamedAttachmentQueueConfig<KnownQueues>
  /** Advanced escape hatch overriding the configured store job processor. */
  jobHandler?: Integration<AttachmentJobHandler>
  /** Data persistence and processing, independent of file storage. No auto-detection. */
  store?: AttachmentStoreConfig
  /** Lowest-priority defaults for file persistence. */
  defaults?: AttachmentPersistenceOptions
  /** Shared path prefix for generated variants. */
  variant?: VariantPathOptions
  sources?: AttachmentManagerOptions
  route?: AttachmentRouteConfig
  media?: AttachmentMediaConfig
  events?: AttachmentEventsConfig
  converters?: KnownConverters
  createId?: () => string
}

export type ResolvedAttachmentConfig<KnownConverters extends ConverterConfigMap = ConverterConfigMap> = AttachmentServiceOptions & {
  store?: AttachmentStore
  /** Internal bridge for the low-level Lucid worker factory. */
  processingAdapters: AttachmentProcessingAdapters
  storeContext: AttachmentStoreContext
  repository?: AttachmentRepository
  defaults?: AttachmentPersistenceOptions
  variant?: VariantPathOptions
  sources?: AttachmentManagerOptions
  route: ResolvedAttachmentRouteConfig | false
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
export function defineConfig<
  const KnownConverters extends ConverterConfigMap = {},
  const KnownQueues extends AttachmentQueueConnections = AttachmentQueueConnections,
>(
  config: AttachmentConfig<KnownConverters, KnownQueues>
): ConfigProvider<ResolvedAttachmentConfig<KnownConverters>> {
  return configProvider.create(async (app) => {
    if (!config.storage) {
      throw new AttachmentConfigurationError(
        'Attachment storage is required. Add storage: AdonisDriveStorage.fromApp to config/attachment.ts when using Adonis Drive.'
      )
    }
    const selectedQueue = selectQueue(config.queue)
    const storageContext: AttachmentStorageContext = {
      ...(config.defaultDisk !== undefined ? { defaultDisk: config.defaultDisk } : {}),
      ...(config.defaults ? { defaults: config.defaults } : {}),
      ...(config.variant ? { variant: config.variant } : {}),
    }
    const storage = typeof config.storage === 'function'
      ? await config.storage(app, storageContext) : config.storage
    if (!storage || typeof storage.write !== 'function' || typeof storage.read !== 'function' || typeof storage.remove !== 'function') {
      throw new AttachmentConfigurationError('Invalid attachment storage: write, read and remove methods are required')
    }
    const obsolete = config as unknown as Record<string, unknown>
    for (const key of ['integrations', 'repository', 'processor']) {
      if (key in obsolete) throw new AttachmentConfigurationError(`Attachment config "${key}" has been replaced by store. Use store: LucidAttachmentStore.fromApp or provide a custom AttachmentStore.`)
    }
    if (config.media && 'metadataPersister' in config.media) {
      throw new AttachmentConfigurationError('media.metadataPersister has moved to store.metadataPersister')
    }
    const defaultDisk = config.defaultDisk ?? storage.defaultDisk ?? 'fs'
    const storeContext: AttachmentStoreContext = {
      defaultDisk,
      ...(config.defaults ? { defaults: config.defaults } : {}),
      ...(config.variant ? { variant: config.variant } : {}),
    }
    const store = config.store === false || config.store === undefined ? undefined
      : typeof config.store === 'function' ? await config.store(app, storeContext) : config.store
    if (store && (typeof store.repository?.findById !== 'function' ||
        (store.variants !== undefined && typeof store.variants !== 'function') ||
        (store.metadataPersister !== undefined && typeof store.metadataPersister?.persistMetadata !== 'function'))) {
      throw new AttachmentConfigurationError('Invalid attachment store: provide a repository and valid optional variants/metadataPersister capabilities')
    }
    if (config.store !== false && config.store !== undefined && !store) {
      throw new AttachmentConfigurationError('Attachment store factory must return an AttachmentStore')
    }
    if (store?.persistence) hasAttachmentTransactions(store.persistence)
    const metadataExtractors =
      config.media?.metadata !== undefined
        ? await resolveIntegration(config.media.metadata, app)
        : createDefaultMetadataExtractors(config.media?.binaries ? { binaries: config.media.binaries } : {})
    const resolvedMetadataPersister = store?.metadataPersister
    const repository = store?.repository
    const events = config.events ? await resolveIntegration(config.events, app) : undefined
    const converters = config.converters
      ? new ConfiguredVariantConverterRegistry(config.converters, {
          autodetect: toAutodetectOptions(config.media?.binaries),
        })
      : undefined
    const processor = !config.jobHandler && store
      ? createAttachmentProcessor(app, { store, context: storeContext, converters: converters ?? new ConfiguredVariantConverterRegistry({}) })
      : undefined
    const jobHandler: AttachmentJobHandler | undefined = config.jobHandler
      ? await resolveIntegration(config.jobHandler, app)
      : processor ? (job) => processor.process(job) : undefined
    const queue = await resolveQueue(selectedQueue, app, {
      ...storeContext,
      ...(jobHandler ? { handler: jobHandler } : {}),
    })

    if (config.defaults?.variants?.length && !store?.variants && !config.jobHandler && isConfiguredMemoryAttachmentQueue(queue)) {
      throw new AttachmentConfigurationError('Attachment defaults.variants requires a store with variant persistence or a custom jobHandler')
    }

    if (processor && events) {
      processor.setEventEmitter(events)
    }

    if (config.media?.metadataPolicy?.mode === 'deferred' && !resolvedMetadataPersister) {
      throw new AttachmentError(
        'Deferred metadata extraction requires store.metadataPersister',
        { code: 'E_INVALID_ATTACHMENT_CONFIG' }
      )
    }

    return {
      defaultDisk,
      processingAdapters: store && 'processingAdapters' in store ? store.processingAdapters as AttachmentProcessingAdapters : {},
      storeContext,
      ...(store ? { store } : {}),
      storage,
      queue,
      route: resolveRoute(config.route),
      ...(repository ? { repository } : {}),
      ...(config.defaults ? { defaults: config.defaults } : {}),
      ...(config.variant ? { variant: config.variant } : {}),
      ...(config.sources ? { sources: config.sources } : {}),
      metadataExtractors,
      ...(config.media?.metadataPolicy?.mode ? { metadataMode: config.media.metadataPolicy.mode } : {}),
      ...(config.media?.metadataPolicy?.variants !== undefined ? { metadataVariants: config.media.metadataPolicy.variants } : {}),
      ...(resolvedMetadataPersister ? { metadataPersister: resolvedMetadataPersister } : {}),
      ...(events ? { events } : {}),
      ...(converters ? { converters } : {}),
      ...(config.createId ? { createId: config.createId } : {}),
    }
  })
}

function selectQueue(config: unknown): AttachmentQueueConnection | undefined {
  if (config === undefined) return undefined
  if (isAttachmentQueue(config)) return config

  if (typeof config === 'object' && config !== null && ('connections' in config || 'default' in config)) {
    const named = config as NamedAttachmentQueueConfig
    if (
      typeof named.default !== 'string' || named.default.length === 0 ||
      typeof named.connections !== 'object' || named.connections === null ||
      Array.isArray(named.connections) ||
      !Object.hasOwn(named.connections, named.default) ||
      named.connections[named.default] === undefined
    ) {
      throw new AttachmentError(
        `Invalid attachment queue default: ${String(named.default)}. It must name a declared connection.`,
        { code: 'E_INVALID_ATTACHMENT_CONFIG' }
      )
    }
    return named.connections[named.default]
  }

  return config as AttachmentQueueConnection
}

async function resolveQueue(
  config: AttachmentQueueConnection | undefined,
  app: ApplicationService,
  context: AttachmentQueueContext
): Promise<AttachmentQueue> {
  if (config === undefined) {
    return MemoryAttachmentQueue.fromApp(app, context)
  }

  const resolved = typeof config === 'function'
    ? await config(app, context)
    : config

  if (typeof resolved !== 'object' || resolved === null) {
    throw new AttachmentError('Invalid attachment queue connection: expected a driver or queue instance', {
      code: 'E_INVALID_ATTACHMENT_CONFIG',
    })
  }

  if (isAttachmentQueue(resolved)) {
    return resolved
  }

  switch (resolved.driver) {
    case 'memory':
      return MemoryAttachmentQueue.configure({
        ...(resolved.concurrency !== undefined ? { concurrency: resolved.concurrency } : {}),
        ...(resolved.onFailure ? { onFailure: resolved.onFailure } : {}),
      })(app, context)
    case 'adonis':
      return AdonisAttachmentQueue.configure({
        job: resolved.job,
        ...(resolved.queueName ? { queueName: resolved.queueName } : {}),
      })(app, context)
    default:
      throw new AttachmentError(
        `Unknown attachment queue driver: ${String((resolved as { driver?: unknown }).driver)}`,
        { code: 'E_INVALID_ATTACHMENT_CONFIG' }
      )
  }
}

function isAttachmentQueue(value: unknown): value is AttachmentQueue {
  return typeof value === 'object' && value !== null && 'enqueue' in value && typeof value.enqueue === 'function'
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

  return { path: `${prefix.replace(/\/+$/, '') || ''}/:id/:name?` }
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
