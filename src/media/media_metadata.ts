/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Attachment } from '../core/attachment.js'

export type MediaMetadataInput = {
  attachment: Attachment
  body: Uint8Array
}

/**
 * Extracts technical metadata from one attachment source. Implementations may
 * opt out of an input by returning false from `supports`.
 */
export interface MediaMetadataExtractor {
  supports?(input: Pick<MediaMetadataInput, 'attachment'>): boolean | Promise<boolean>
  extract(input: MediaMetadataInput): Promise<Record<string, unknown> | undefined>
}

/** Runs matching metadata extractors in declaration order. */
export class MediaMetadataService {
  readonly #extractors: readonly MediaMetadataExtractor[]

  constructor(extractors: readonly MediaMetadataExtractor[]) {
    this.#extractors = extractors
  }

  async extract(input: MediaMetadataInput): Promise<Record<string, unknown> | undefined> {
    let metadata: Record<string, unknown> | undefined

    for (const extractor of this.#extractors) {
      if (extractor.supports && !(await extractor.supports({ attachment: input.attachment }))) {
        continue
      }

      const extracted = await extractor.extract(input)

      if (extracted) {
        metadata = { ...metadata, ...extracted }
      }
    }

    return metadata
  }
}
