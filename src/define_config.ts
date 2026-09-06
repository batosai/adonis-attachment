/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { configProvider } from '@adonisjs/core'
import {
  MemoryAttachmentQueue,
  type AttachmentQueueFailureHandler,
} from './queues/memory_queue.js'
import {
  AdonisAttachmentQueue,
  type AdonisAttachmentJob,
} from './queues/adonis_queue.js'
import {
  AttachmentError,
  AttachmentProcessorNotConfiguredError,
} from './errors.js'
import {
  resolveAttachmentTableNames,
  type AttachmentTableNames,
} from './integrations/lucid/schema/attachment_table_names.js'

import type { ApplicationService, ConfigProvider } from '@adonisjs/core/types'
import type { AttachmentServiceOptions } from './core/attachment_service.js'
import type { AttachmentMetadataMode } from './core/attachment_service.js'
import type { AttachmentMetadataPersister } from './core/attachment_metadata_persister.js'
import { AttachmentJobProcessor } from './core/attachment_job_processor.js'
import type { AttachmentRepository } from './core/attachment_repository.js'
import type { AttachmentJobHandler, AttachmentQueue } from './core/queue.js'
import type { AttachmentStorage } from './core/storage.js'
import type { AttachmentManagerOptions } from './sources/attachment_manager.js'
import type { AttachmentPersistenceOptions } from './core/attachment_options.js'
import type { MediaMetadataExtractor } from './media/media_metadata.js'
import type { AttachmentBinariesConfig } from './media/binary_config.js'
import type { AttachmentEventEmitter } from './events/attachment_events.js'
import { createDefaultMetadataExtractors } from './media/default_metadata.js'
import { loadOptionalDependency } from './utils/optional_dependency.js'
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

export type LucidAttachmentConfig = {
  /** Blob table name. The link table is derived as `${singular(tableName)}_links`. */
  tableName?: string
}

export type AttachmentIntegrationsConfig = {
  /** Configures Lucid when detected in the container, or disables its automatic integration. */
  lucid?: LucidAttachmentConfig | false
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

export type AttachmentQueueConnection = AttachmentQueueConfig | Integration<AttachmentQueue>

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
  storage: Integration<AttachmentStorage>
  queue?: AttachmentQueueConnection | NamedAttachmentQueueConfig<KnownQueues>
  /** Overrides every processor, including the automatic Lucid memory processor. */
  jobHandler?: Integration<AttachmentJobHandler>
  /** Overrides the processor automatically created for an in-memory Lucid integration. */
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
export function defineConfig<
  const KnownConverters extends ConverterConfigMap = {},
  const KnownQueues extends AttachmentQueueConnections = AttachmentQueueConnections,
>(
  config: AttachmentConfig<KnownConverters, KnownQueues>
): ConfigProvider<ResolvedAttachmentConfig<KnownConverters>> {
  return configProvider.create(async (app) => {
    const selectedQueue = selectQueue(config.queue)
    const storage = await resolveIntegration(config.storage, app)
    const lucid = resolveLucidIntegration(app, config.integrations?.lucid)
    const metadataExtractors =
      config.media?.metadata !== undefined
        ? await resolveIntegration(config.media.metadata, app)
        : createDefaultMetadataExtractors(config.media?.binaries ? { binaries: config.media.binaries } : {})
    const metadataPersister = config.media?.metadataPersister
      ? await resolveIntegration(config.media.metadataPersister, app)
      : undefined
    const resolvedMetadataPersister = metadataPersister
      ?? await resolveLucidMetadataPersister(config.media?.metadataPolicy?.mode, lucid)
    const repository = config.repository
      ? await resolveIntegration(config.repository, app)
      : lucid
        ? await resolveLucidRepository()
        : undefined
    const events = config.events ? await resolveIntegration(config.events, app) : undefined
    const converters = config.converters
      ? new ConfiguredVariantConverterRegistry(config.converters, {
          autodetect: toAutodetectOptions(config.media?.binaries),
        })
      : undefined
    const configuredProcessor = config.processor ? await resolveIntegration(config.processor, app) : undefined
    const processor =
      configuredProcessor ??
      (!config.jobHandler && usesConfiguredMemoryQueue(selectedQueue) && lucid && repository
        ? await createDefaultLucidProcessor(app, repository, converters)
        : undefined)
    const jobHandler: AttachmentJobHandler | undefined = config.jobHandler
      ? await resolveIntegration(config.jobHandler, app)
      : processor
        ? (job) => processor.process(job)
        : undefined
    const queue = await resolveQueue(selectedQueue, app, jobHandler)

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
      ...(repository ? { repository } : {}),
      ...(config.defaults ? { defaults: config.defaults } : {}),
      ...(config.sources ? { sources: config.sources } : {}),
      metadataExtractors,
      ...(config.media?.metadataPolicy?.mode ? { metadataMode: config.media.metadataPolicy.mode } : {}),
      ...(config.media?.metadataPolicy?.variants !== undefined ? { metadataVariants: config.media.metadataPolicy.variants } : {}),
      ...(resolvedMetadataPersister ? { metadataPersister: resolvedMetadataPersister } : {}),
      ...(events ? { events } : {}),
      ...(converters ? { converters } : {}),
      ...(lucid
        ? {
            integrations: {
              lucid,
            },
          }
        : {}),
      ...(config.createId ? { createId: config.createId } : {}),
    }
  })
}

function selectQueue(config: unknown): AttachmentQueueConnection | undefined {
  if (config === undefined) return undefined

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
  handler: AttachmentJobHandler | undefined
): Promise<AttachmentQueue> {
  if (config === undefined) {
    return createMemoryQueue(handler)
  }

  const resolved = typeof config === 'function'
    ? await resolveIntegration(config, app)
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
      return createMemoryQueue(handler, {
        ...(resolved.concurrency !== undefined ? { concurrency: resolved.concurrency } : {}),
        ...(resolved.onFailure ? { onFailure: resolved.onFailure } : {}),
      })
    case 'adonis':
      return new AdonisAttachmentQueue({
        job: resolved.job,
        ...(resolved.queueName ? { queueName: resolved.queueName } : {}),
      })
    default:
      throw new AttachmentError(
        `Unknown attachment queue driver: ${String((resolved as { driver?: unknown }).driver)}`,
        { code: 'E_INVALID_ATTACHMENT_CONFIG' }
      )
  }
}

function createMemoryQueue(
  handler: AttachmentJobHandler | undefined,
  options: Omit<MemoryAttachmentQueueConfig, 'driver'> = {}
): MemoryAttachmentQueue {
  if (!handler) {
    return new UnconfiguredMemoryAttachmentQueue(options)
  }

  return new MemoryAttachmentQueue({ handler, ...options })
}

class UnconfiguredMemoryAttachmentQueue extends MemoryAttachmentQueue {
  constructor(options: Omit<MemoryAttachmentQueueConfig, 'driver'>) {
    super({ handler: async () => {}, ...options })
  }

  override enqueue(): Promise<void> {
    return Promise.reject(new AttachmentProcessorNotConfiguredError())
  }
}

function usesConfiguredMemoryQueue(config: AttachmentQueueConnection | undefined): boolean {
  if (config === undefined) {
    return true
  }

  return typeof config === 'object' && config !== null && !isAttachmentQueue(config) && config.driver === 'memory'
}

async function createDefaultLucidProcessor(
  app: ApplicationService,
  repository: AttachmentRepository,
  converters: VariantConverterRegistry | undefined
): Promise<AttachmentJobProcessor> {
  const { createLucidAttachmentProcessor } = await loadOptionalDependency(
    '@adonisjs/lucid',
    () => import('./integrations/lucid/create_lucid_attachment_processor.js')
  )
  const resolvedConverters = converters ?? new ConfiguredVariantConverterRegistry({})

  return createLucidAttachmentProcessor(app, {
    repository,
    converters: resolvedConverters,
  })
}

function isAttachmentQueue(value: AttachmentQueue | AttachmentQueueConfig): value is AttachmentQueue {
  return 'enqueue' in value && typeof value.enqueue === 'function'
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
  lucid: AttachmentTableNames | undefined
): Promise<AttachmentMetadataPersister | undefined> {
  if (mode !== 'deferred' || !lucid) {
    return undefined
  }

  const { LucidAttachmentMetadataPersister } = await loadOptionalDependency(
    '@adonisjs/lucid',
    () => import('./integrations/lucid/persistence/lucid_attachment_metadata_persister.js')
  )
  return new LucidAttachmentMetadataPersister()
}

async function resolveLucidRepository(): Promise<AttachmentRepository> {
  const { LucidAttachmentRepository } = await loadOptionalDependency(
    '@adonisjs/lucid',
    () => import('./integrations/lucid/persistence/lucid_attachment_repository.js')
  )
  return new LucidAttachmentRepository()
}

function resolveLucidIntegration(
  app: ApplicationService,
  lucid: LucidAttachmentConfig | false | undefined
): AttachmentTableNames | undefined {
  if (lucid === false) {
    return undefined
  }

  if (lucid || app.container?.hasBinding?.('lucid.db')) {
    return resolveAttachmentTableNames(lucid?.tableName)
  }

  return undefined
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
