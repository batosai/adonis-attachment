/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Verrou } from '@verrou/core'
import type { StoreFactory } from '@verrou/core/types'

interface LockStoresList {}

export interface LockService extends Verrou<
  LockStoresList extends Record<string, StoreFactory> ? LockStoresList : never
> {}
