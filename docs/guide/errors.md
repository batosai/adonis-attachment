# Errors

## Troubleshooting

| Symptom | Check first |
| --- | --- |
| No attachment tables | Run `node ace make:attachments-table`, then `node ace migration:run`; check `integrations.lucid.tableName` for custom names. |
| `createFromFile` fails before persistence | Check that the upload exists, is valid, and has a temporary path. See the [validated upload example](/guide/getting-started). |
| Original exists but thumbnail is absent | Confirm the key is enabled in `variants`, check the required media dependency, and report queue failures with `onFailure`. External queues also need a running worker. |
| Invalid attachment queue default at boot | Check that `queue.default` matches a key in `queue.connections`. Validate `ATTACHMENT_QUEUE` with an enum when selecting by environment; no fallback is applied to an unknown name. |
| File route returns 404 | Use the blob ID, not the link ID. Check the route prefix and repository; without Lucid or an explicit repository, no route is registered. |
| Private file is still publicly accessible | Set `route: false` and check that the underlying storage does not also expose a public URL. |
| Filename rejected by Drive | Keep `normalizeFileName: true`, especially with `rename: false`; see [folder and rename](/guide/creating-attachments#folder-and-rename). |

## Catching errors

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
| `AttachmentProcessorNotConfiguredError` | `E_ATTACHMENT_PROCESSOR_NOT_CONFIGURED` | 500 | The memory queue has no processor and Lucid is unavailable. |
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
