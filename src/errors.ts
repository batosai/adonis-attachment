/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { Exception } from '@adonisjs/core/exceptions'

export type AttachmentErrorOptions = ErrorOptions & {
  code?: string
  status?: number
}

/** Base exception for every error emitted by this package. */
export class AttachmentError extends Exception {
  static code = 'E_ATTACHMENT_ERROR'
  static status = 500

  constructor(message: string, options: AttachmentErrorOptions = {}) {
    super(message, options)
    const constructor = new.target as typeof AttachmentError
    this.code = options.code ?? constructor.code
    this.status = options.status ?? constructor.status
  }
}

/** Raised when an attachment source cannot be normalized. */
export class AttachmentSourceError extends AttachmentError {
  constructor(message: string, options: AttachmentErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? 'E_ATTACHMENT_SOURCE',
      status: options.status ?? 400,
    })
  }
}

/** Raised when caller-provided attachment data fails a package invariant. */
export class AttachmentValidationError extends AttachmentError {
  static code = 'E_INVALID_ATTACHMENT'
  static status = 400
}

/** Raised when an attachment operation conflicts with current persisted state. */
export class AttachmentConflictError extends AttachmentError {
  static code = 'E_ATTACHMENT_CONFLICT'
  static status = 409
}

/** Raised when an adapter or integration has been configured incorrectly. */
export class AttachmentConfigurationError extends AttachmentError {
  static code = 'E_ATTACHMENT_CONFIGURATION'
}

export class AttachmentNotFoundError extends AttachmentError {
  constructor(attachmentId: string) {
    super(`Attachment "${attachmentId}" was not found`, {
      code: 'E_ATTACHMENT_NOT_FOUND',
      status: 404,
    })
  }
}

export class DeferredMetadataProcessorNotConfiguredError extends AttachmentError {
  constructor() {
    super('Attachment metadata jobs require a configured metadata processor', {
      code: 'E_METADATA_PROCESSOR_NOT_CONFIGURED',
    })
  }
}

export class DeferredMetadataNotConfiguredError extends AttachmentError {
  constructor() {
    super('Deferred metadata extraction requires configured extractors and a metadata persister', {
      code: 'E_METADATA_NOT_CONFIGURED',
    })
  }
}

export class InvalidConverterModuleError extends AttachmentError {
  constructor(key: string) {
    super(`Converter "${key}" must default-export a Converter class or a VariantConverter object`, {
      code: 'E_INVALID_CONVERTER_MODULE',
    })
  }
}

export class UnknownVariantConverterError extends AttachmentError {
  constructor(key: string) {
    super(`No variant converter is registered for "${key}"`, {
      code: 'E_UNKNOWN_VARIANT_CONVERTER',
      status: 422,
    })
  }
}

export class PersistedAttachmentNotFoundError extends AttachmentError {
  constructor(id: string) {
    super(`Persisted attachment "${id}" was not found`, {
      code: 'E_PERSISTED_ATTACHMENT_NOT_FOUND',
      status: 404,
    })
  }
}

export class MissingOptionalDependencyError extends AttachmentError {
  constructor(packages: string | readonly string[]) {
    const names = Array.isArray(packages) ? packages : [packages]
    super(`Missing optional ${names.length === 1 ? 'dependency' : 'dependencies'}: ${names.join(', ')}`, {
      code: 'E_MISSING_PACKAGE',
    })
  }
}
