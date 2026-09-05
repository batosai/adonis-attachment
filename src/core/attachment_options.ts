import type { AttachmentVariantKey } from '../../index.js'

export type AttachmentPersistenceContext<Model = unknown> = {
  model?: Model
  field?: string
  originalName: string
}

export type AttachmentFolder<Model = unknown> =
  | string
  | ((context: AttachmentPersistenceContext<Model>) => string | Promise<string>)

export type AttachmentRename<Model = unknown> =
  | boolean
  | ((context: AttachmentPersistenceContext<Model>) => string | Promise<string>)

/**
 * File-persistence settings. `null` explicitly disables an inherited setting.
 */
export type AttachmentPersistenceOptions<Model = unknown> = {
  disk?: string | null
  folder?: AttachmentFolder<Model> | null
  rename?: AttachmentRename<Model> | null
  /** Normalizes user-supplied storage names to a portable ASCII filename. Defaults to true. */
  normalizeFileName?: boolean | null
  meta?: boolean | null
  preComputeUrl?: boolean | null
  variants?: readonly AttachmentVariantKey[] | null
}

export type ResolvedAttachmentPersistenceOptions<Model = unknown> = {
  disk?: string
  folder?: AttachmentFolder<Model>
  rename?: AttachmentRename<Model>
  normalizeFileName?: boolean
  meta?: boolean
  preComputeUrl?: boolean
  variants?: readonly AttachmentVariantKey[]
}

/**
 * Resolves options from lowest to highest priority. An explicit `null` clears
 * the inherited value for one setting.
 */
export function resolveAttachmentPersistenceOptions<Model = unknown>(
  ...layers: ReadonlyArray<AttachmentPersistenceOptions<Model> | undefined>
): ResolvedAttachmentPersistenceOptions<Model> {
  return {
    ...resolveOption('disk', layers),
    ...resolveOption('folder', layers),
    ...resolveOption('rename', layers),
    ...resolveOption('normalizeFileName', layers),
    ...resolveOption('meta', layers),
    ...resolveOption('preComputeUrl', layers),
    ...resolveOption('variants', layers),
  }
}

function resolveOption<Model, Key extends keyof AttachmentPersistenceOptions<Model>>(
  key: Key,
  layers: ReadonlyArray<AttachmentPersistenceOptions<Model> | undefined>
): Partial<ResolvedAttachmentPersistenceOptions<Model>> {
  for (const layer of [...layers].reverse()) {
    const value = layer?.[key]

    if (value !== undefined) {
      return value === null ? {} : { [key]: value }
    }
  }

  return {}
}
