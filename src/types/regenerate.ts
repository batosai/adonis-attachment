/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentVariants } from '@jrmc/adonis-attachment'

export type RegenerateOptions = {
  attributes?: string[],
  variants?: (keyof AttachmentVariants)[]
}
