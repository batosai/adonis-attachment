# Errors

Every error emitted by the package extends `AttachmentError`, itself an Adonis `Exception`.
It exposes a stable `code`, a HTTP-oriented `status`, and an optional `cause`. Catch the base
class when an application needs one handling path for storage, sources, queues, or Lucid.

```ts
import { AttachmentError } from '@jrmc/adonis-attachment'

try {
  await attachmentManager.createFromBase64(input)
} catch (error) {
  if (error instanceof AttachmentError) {
    logger.warn({ code: error.code, status: error.status, cause: error.cause }, error.message)
    throw error
  }

  throw error
}
```

## Public errors

| Error | Code | Status | Meaning |
| --- | --- | --- | --- |
| `AttachmentSourceError` | `E_ATTACHMENT_SOURCE` | 400 | A source cannot be normalized. Specific source failures use the codes below. |
| `AttachmentNotFoundError` | `E_ATTACHMENT_NOT_FOUND` | 404 | A worker cannot load its original attachment. |
| `UnknownVariantConverterError` | `E_UNKNOWN_VARIANT_CONVERTER` | 422 | A requested variant key has no converter. |
| `InvalidConverterModuleError` | `E_INVALID_CONVERTER_MODULE` | 500 | A configured converter module has an unsupported export. |
| `DeferredMetadataNotConfiguredError` | `E_METADATA_NOT_CONFIGURED` | 500 | Deferred metadata has no extractors or persister. |
| `DeferredMetadataProcessorNotConfiguredError` | `E_METADATA_PROCESSOR_NOT_CONFIGURED` | 500 | A worker has no metadata processor. |
| `PersistedAttachmentNotFoundError` | `E_PERSISTED_ATTACHMENT_NOT_FOUND` | 404 | A variant job targets a blob that no longer exists. |
| `CommandExecutionError` | `E_COMMAND_EXECUTION_FAILED` | 500 | An external binary exits unsuccessfully. |
| `CommandTimeoutError` | `E_COMMAND_TIMEOUT` | 504 | An external binary exceeds its configured timeout. |
| `MissingOptionalDependencyError` | `E_MISSING_PACKAGE` | 500 | An enabled optional adapter cannot load its dependency. |

`CommandExecutionError` and `CommandTimeoutError` are exported by
`@jrmc/adonis-attachment/media/binaries`; the other errors in this table are exported from
the package root.

## Other stable codes

Input and source errors include `E_ISNOT_BASE64`, `E_ATTACHMENT_SOURCE_TOO_LARGE` (413),
`E_MULTIPART_SOURCE_PATH_MISSING`, and `E_ATTACHMENT_SOURCE_DOWNLOAD_FAILED` (502).
Configuration and integration failures use `E_INVALID_ATTACHMENT_CONFIG`,
`E_INVALID_ATTACHMENT_ROUTE`, `E_INVALID_ATTACHMENT_TABLE_NAME`, `E_DRIVE_CONFIG_NOT_FOUND`,
and `E_ATTACHMENT_CONFIGURATION`.

Attachment invariants use `E_ATTACHMENT_DRAFT_SOURCE_UNAVAILABLE`,
`E_ATTACHMENT_DRAFT_NOT_PERSISTED`, `E_INVALID_ATTACHMENT_NAME`, and
`E_INVALID_ATTACHMENT_FOLDER`. Collection and relation validation uses
`E_INVALID_ATTACHMENT` or `E_ATTACHMENT_CONFLICT` (409).

## Optional processing

Blurhash generation is intentionally best-effort: when its optional dependencies are missing
or encoding fails, the generated variant is retained without a blurhash. No exception reaches
the caller in that case. Other optional adapters, such as EXIF and Sharp autodetection, throw
`MissingOptionalDependencyError` when invoked without their dependency.
