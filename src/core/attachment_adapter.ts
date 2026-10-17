/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'
import type { AttachmentPersistenceOptions } from './attachment_options.js'
import type { VariantPathOptions } from '../variants/variant_path.js'

/** Shared configuration available to adapters during application boot. */
export type AttachmentAdapterContext = {
  /** Explicit config value for storage; resolved storage default for store and queue. */
  defaultDisk?: string
  defaults?: AttachmentPersistenceOptions
  variant?: VariantPathOptions
}

/** All storage, store and queue factories use the same two-argument convention. */
export type AttachmentAdapterFactory<Adapter, Context extends AttachmentAdapterContext = AttachmentAdapterContext> = (
  app: ApplicationService,
  context: Context,
) => Adapter | Promise<Adapter>

export type AttachmentAdapterConfig<Adapter, Context extends AttachmentAdapterContext = AttachmentAdapterContext> =
  Adapter | AttachmentAdapterFactory<Adapter, Context>
