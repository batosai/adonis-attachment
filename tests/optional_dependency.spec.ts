/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { MissingOptionalDependencyError } from '../src/errors.js'
import { loadOptionalDependency } from '../src/utils/optional_dependency.js'

test.group('optional dependencies', () => {
  test('root aliases defer optional peers until adapter resolution', async () => {
    await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
      import { registerHooks } from 'node:module'
      import assert from 'node:assert/strict'
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (/^@adonisjs\\/(lucid|drive|queue)(\\/|$)/.test(specifier)) {
          throw Object.assign(new Error('Peer deliberately unavailable'), { code: 'ERR_MODULE_NOT_FOUND' })
        }
        return nextResolve(specifier, context)
      } })
      const { store, storage, queue } = await import(${JSON.stringify(new URL('../index.js', import.meta.url).href)})
      assert.equal(typeof storage.local(), 'function')
      assert.equal(typeof storage.drive(), 'function')
      assert.equal(typeof queue.memory(), 'function')
      assert.equal(typeof queue.adonis({ job: { dispatch() {} } }), 'function')
      const factory = store.lucid()
      await assert.rejects(() => factory({}, { defaultDisk: 'fs' }), {
        code: 'E_MISSING_PACKAGE',
      })
    `])
  })

  test('reports a missing peer with an actionable package error', async ({ assert }) => {
    const cause = Object.assign(new Error('Cannot find package'), {
      code: 'ERR_MODULE_NOT_FOUND',
    })

    const error = await captureError(() =>
      loadOptionalDependency('exifreader', async () => {
        throw cause
      })
    )

    assert.instanceOf(error, MissingOptionalDependencyError)
    assert.equal((error as MissingOptionalDependencyError).code, 'E_MISSING_PACKAGE')
    assert.equal((error as MissingOptionalDependencyError).cause, cause)
    assert.include((error as Error).message, 'Install exifreader')
  })

  test('does not hide initialization failures from an installed package', async ({ assert }) => {
    const cause = new Error('package initialization failed')

    const error = await captureError(() =>
      loadOptionalDependency('sharp', async () => {
        throw cause
      })
    )

    assert.equal(error, cause)
  })
})

async function captureError(callback: () => Promise<unknown>): Promise<unknown> {
  try {
    await callback()
  } catch (error) {
    return error
  }

  throw new Error('Expected callback to throw')
}
