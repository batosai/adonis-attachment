/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../core/attachment.js'

export type VariantPathContext = {
  attachment: Attachment
}

/** A storage folder for generated variants. `:name` keeps the original storage name verbatim. */
export type VariantFolder =
  | string
  | ((context: VariantPathContext) => string | Promise<string>)

/** Global generated-variant path settings. */
export type VariantPathOptions = {
  /** Prefix added before the converter's variant folder. */
  basePath?: VariantFolder | null
}

export async function resolveVariantFolder(
  value: VariantFolder | undefined,
  context: VariantPathContext
): Promise<string | undefined> {
  if (value === undefined) return undefined
  const folder = typeof value === 'function' ? await value(context) : value

  return folder.replace(/:([a-zA-Z][a-zA-Z0-9_]*)/g, (parameter, key: keyof Attachment) => {
    const attribute = context.attachment[key]
    // V5 used the storage name itself as the variant namespace. Keep it byte-for-byte so a
    // migrated `folder: ':name'` preserves paths such as `uuid.jpg`, not `uuid-jpg`.
    return typeof attribute === 'string' ? attribute : parameter
  })
}

export function joinVariantFolders(basePath: string | undefined, folder: string | undefined): string | undefined {
  const folders = [basePath, folder].filter((value): value is string => !!value)
  return folders.length ? folders.join('/') : undefined
}
