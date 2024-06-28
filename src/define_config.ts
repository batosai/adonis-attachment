/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { AttachmentConfig } from './types.js'
import { InvalidArgumentsException } from '@poppinss/utils'

export function defineConfig<T extends AttachmentConfig>(config: T): T {
  if (!config) {
    throw new InvalidArgumentsException('Invalid config. It must be a valid object')
  }

  return config
}
