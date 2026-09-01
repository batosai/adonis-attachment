/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import { MissingOptionalDependencyError } from '../src/errors.js'
import { loadOptionalDependency } from '../src/utils/optional_dependency.js'

test.group('optional dependencies', () => {
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
