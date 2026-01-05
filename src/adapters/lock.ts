/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { LockService } from '../types/lock.js'

import { Verrou } from '@verrou/core'
import { memoryStore } from '@verrou/core/drivers/memory'

export const verrou = (lock?: LockService): LockService => {
  if (lock) {
    return lock
  } else {
    return new Verrou({
      default: 'memory',
      stores: {
        memory: { driver: memoryStore() },
      },
    })
  }
}
