/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const scopes = new AsyncLocalStorage<Map<string, boolean>>()

/** Only paths explicitly created by the package belong to this scope. */
export function trackTemporaryFile(path: string): string {
  scopes.getStore()?.set(path, false)
  return path
}

export async function withTemporaryFiles<T>(callback: () => Promise<T>): Promise<T> {
  const paths = new Map<string, boolean>()
  return scopes.run(paths, async () => {
    try {
      return await callback()
    } finally {
      await Promise.all([...paths].map(([path, recursive]) => rm(path, { force: true, recursive })))
    }
  })
}

/** Isolates converter outputs, including partial files produced on failure. */
export async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'adonis-attachment-'))
  scopes.getStore()?.set(directory, true)
  return directory
}
