/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'

import {
  AttachmentError,
  AttachmentNotFoundError,
  AttachmentSourceError,
  MissingOptionalDependencyError,
  UnknownVariantConverterError,
} from '../index.js'
import { CommandExecutionError, CommandTimeoutError } from '../src/media/binaries.js'

test.group('Attachment errors', () => {
  test('exposes stable source error codes and statuses', ({ assert }) => {
    const error = new AttachmentSourceError('Invalid source', {
      code: 'E_ISNOT_BASE64',
      status: 400,
    })

    assert.instanceOf(error, AttachmentError)
    assert.equal(error.code, 'E_ISNOT_BASE64')
    assert.equal(error.status, 400)
  })

  test('uses subclass error codes and statuses', ({ assert }) => {
    const notFound = new AttachmentNotFoundError('attachment-id')
    const converter = new UnknownVariantConverterError('thumbnail')

    assert.equal(notFound.code, 'E_ATTACHMENT_NOT_FOUND')
    assert.equal(notFound.status, 404)
    assert.equal(converter.code, 'E_UNKNOWN_VARIANT_CONVERTER')
    assert.equal(converter.status, 422)
  })

  test('preserves causes and command execution details', ({ assert }) => {
    const cause = new Error('spawn failed')
    const failed = new CommandExecutionError({ command: 'ffmpeg', args: [] }, null, cause.message, {
      cause,
    })
    const timeout = new CommandTimeoutError({ command: 'ffprobe', args: [], timeout: 5_000 })
    const missing = new MissingOptionalDependencyError(['sharp', 'blurhash'])

    assert.equal(failed.code, 'E_COMMAND_EXECUTION_FAILED')
    assert.equal(failed.cause, cause)
    assert.equal(timeout.code, 'E_COMMAND_TIMEOUT')
    assert.equal(timeout.status, 504)
    assert.equal(missing.code, 'E_MISSING_PACKAGE')
    assert.equal(
      missing.message,
      'Missing optional dependencies: sharp, blurhash. Install sharp and blurhash to use this feature.'
    )
  })
})
