---
name: adonis-attachment-media
description: Use when configuring @jrmc/adonis-attachment v6 variants, converters, image or document metadata, blurhash, background queues, regeneration, or media processing failures in an AdonisJS application.
metadata:
  package: "@jrmc/adonis-attachment"
  major-version: "6"
---

# Attachment v6 media processing

Target the consuming AdonisJS 7 / Node.js 24+ application. Check installed package version,
existing config, enabled variants, metadata policy, storage, and worker before changing them.
Do not mix v5 imports or queue APIs into v6. Read
[media and worker recipes](references/media.md) for concrete configuration and diagnostics.

## Choose the smallest workflow

- Named `converters` plus relation `variants` is enough for common conversions. Omitting
  `converter` selects autodetect; `make:converter` is for custom processing, not required setup.
- With Lucid, drafts staged on relations are written on owner save; variant jobs are queued
  after commit. No variant is guaranteed to exist when the upload response arrives.
- `meta: true` enables metadata independently of variants. Default image extraction uses
  Sharp, then EXIF where supported; SVG uses Sharp only. GPS normalization is built in.
- PDF metadata requires `pdfinfo`; a PDF thumbnail requires `pdftoppm`. Video metadata
  requires `ffprobe`; video thumbnails require `ffmpeg`. Do not confuse these executables.
- DOCX originals currently have no metadata extractor. Document thumbnails can still use
  LibreOffice and Poppler. No extracted metadata is different from a processing error.
- A missing dependency or corrupt supported file raises an error; unsupported MIME types
  are skipped. Blurhash alone is best-effort and may be absent without failing the variant.
- Configure `queue.default` and `queue.connections` for environment selection. Memory is
  the fallback when queue is omitted, in-process, non-durable, and has no automatic retry.
- Outside Lucid, the application owns rows, cleanup, and post-commit scheduling. A generic
  generator alone does not provide variant persistence or replacement semantics.

## Verify the result

Test an actual input of the affected format, not only a fake converter. Inspect the original,
variant rows and bytes, and extracted fields. Test missing/corrupt input and queue errors.
Use `MemoryAttachmentQueue.drain()` with `onFailure` assertions in queue tests, not sleeps.
Do not hide failures with blanket catches or add SVG to EXIF support to make a test pass.
