/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { createError } from '@adonisjs/core/exceptions'
import { errors } from 'flydrive'

/**
 * Unable to write file to the destination
 */
export const E_CANNOT_WRITE_FILE = errors.E_CANNOT_WRITE_FILE

/**
 * Unable to read file
 */
export const E_CANNOT_READ_FILE = errors.E_CANNOT_READ_FILE

/**
 * Unable to delete file
 */
export const E_CANNOT_DELETE_FILE = errors.E_CANNOT_DELETE_FILE

/**
 * Unable to set file visibility
 */
export const E_CANNOT_SET_VISIBILITY = errors.E_CANNOT_SET_VISIBILITY

/**
 * Unable to generate URL for a file
 */
export const E_CANNOT_GENERATE_URL = errors.E_CANNOT_GENERATE_URL

/**
 * Unable to generate temp file
 */
export const E_CANNOT_GENERATE_TEMP_FILE = createError<[key: string]>(
  'Cannot generate temp file "%s"',
  'E_CANNOT_GENERATE_TEMP_FILE'
)

/**
 * The file key has unallowed set of characters
 */
export const E_UNALLOWED_CHARACTERS = errors.E_UNALLOWED_CHARACTERS

/**
 * Key post normalization leads to an empty string
 */
export const E_INVALID_KEY = errors.E_INVALID_KEY

/**
 * Missing package
 */
export const E_MISSING_PACKAGE = createError<[key: string]>(
  'Missing package, please install "%s"',
  'E_MISSING_PACKAGE'
)

/**
 * Unable to create Attachment Object
 */
export const E_CANNOT_CREATE_ATTACHMENT = createError<[key: string]>(
  'Cannot create attachment from database response. Missing attribute "%s"',
  'E_CANNOT_CREATE_ATTACHMENT'
)

/**
 * Unable to create variant
 */
export const E_CANNOT_CREATE_VARIANT = createError<[key: string]>(
  'Cannot create variant. "%s"',
  'E_CANNOT_CREATE_VARIANT'
)

/**
 * Missing path
 */
export const E_CANNOT_PATH_BY_CONVERTER = createError(
  'Path not found',
  'E_CANNOT_PATH_BY_CONVERTER'
)

/**
 * Is not a Buffer
 */
export const E_ISNOT_BUFFER = createError('Is not a Buffer', 'E_ISNOT_BUFFER')

/**
 * Is not a Base64
 */
export const E_ISNOT_BASE64 = createError('Is not a Base64', 'E_ISNOT_BASE64')

/**
 * Unable to read file
 */
export const ENOENT = createError('File not found', 'ENOENT')
