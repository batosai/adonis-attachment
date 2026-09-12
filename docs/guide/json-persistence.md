# Legacy JSON internals

The JSON engine belongs exclusively to the experimental [/legacy integration](/guide/legacy).
The default [/lucid integration](/guide/lucid) uses attachment and link tables. There is no
public per-field storage switch, and the JSON store/record/worker classes are not exported
from `@jrmc/adonis-attachment/lucid`.

## Architecture and removal boundary

All JSON-specific runtime code lives in `src/integrations/legacy/`:

```text
legacy/
  attachment.ts       Direct values, mutable meta and serialization
  decorator.ts        Legacy model accessors and hydration hooks
  model_fields.ts     Trusted legacy field and column declarations
  config.ts           Activation of JSON repositories and job processors
  errors.ts           Legacy metadata conflicts
  json/
    json_attachment_document.ts
    json_metadata_mutation.ts
    lucid_json_attachment_store.ts
    lucid_json_attachment_registry.ts
    lucid_json_variant_generation_service.ts
```

The module uses shared file lifecycle, conversion, queue and Lucid transaction primitives.
The common model coordinator only knows field callbacks for persistence, deletion and
regeneration. The common worker only knows registered processing adapters; neither imports
the legacy implementation or selects behavior by a hard-coded JSON adapter name.

`integrations.legacy.models` activates the module through the config resolver. Its logical
job adapter remains `json`, preserving existing contextual references and queued jobs.
The provider exposes a generic processing-adapter registry to memory and external workers.

To remove the compatibility module, remove its directory, the `/legacy` entry/export,
and its config activation/type, then update tests/docs. Keep the shared transaction and
worker interfaces: table attachments use them too. Keep the separate JSON-to-table migration
tools under `lucid/migrations/legacy/` so applications retain a supported exit path.

## Existing data and configuration

The public usage and configuration are documented in [Legacy JSON fields](/guide/legacy)
and [Migration from v5](/migration/from-v5). Use `integrations.legacy.models`, not the old
experimental `integrations.lucid.jsonModels`. The latter fails explicitly rather than
silently disabling workers. The former `persistence: 'json'` relation option and
`AttachmentRelation<'json'>` type are removed.

The internal document reader accepts native or serialized JSON, `meta`, and `variants`.
SQL NULL and serialized JSON null represent an empty field. Collections also accept JSON arrays. Documents without IDs
are read without rewriting the database; deterministic IDs are derived from their logical
owner and file location, then persisted on mutation. Missing disks use the resolved
field/config disk; missing paths use the stored name. Unknown document properties are
retained on updates.

Invalid documents, duplicate IDs, duplicate variant keys, nested variants and duplicate
file locations within a field are rejected. Different JSON fields must not share a file:
there is no global reference count protecting it from deletion by another owner.

The public collection facade is `@attachments()` with `Attachment[] | null`, normal
array edits and owner save. Retained order is stable, new drafts append, and there is no
public reordering API. Membership is diffed against the loaded array, preserving concurrent
additions and never resurrecting concurrently removed items. Explicit null assignment
clears the current field. Internal ordered-array operations are not a separate public API.

## Locking and file effects

Every mutation rereads and locks the existing owner row inside a transaction before
updating its JSON column. PostgreSQL, MySQL/MariaDB, Oracle and SQL Server use their Lucid
locking implementation; SQLite reserves the writer through a no-op owner update.
Oracle uses a lock-compatible query without Knex's LIMIT subquery.

There is no lock table, external lock dependency or `JSON_SET`. The owner column is not
an ordinary Lucid attribute: saving a stale model's unrelated attributes cannot overwrite
the JSON document.

The same outer transaction coordinates ordinary owner attributes, legacy fields and
table-backed relations. New files are cleaned after confirmed rollback; replaced/deleted
files and background jobs are handled after commit. An uncertain commit outcome retains
files because deleting a possibly committed file is unsafe. A post-commit cleanup error
does not roll back published JSON or delete its newly referenced file.

Variant conversion happens outside the publication transaction. Under the lock, the worker
revalidates the original identity/location and publishes the batch atomically. Obsolete
jobs fail instead of attaching files to a replacement original.

## Mutable metadata

The internal metadata patch records the loaded baseline and the user's edits. It merges
these changes into current metadata under the owner lock:

- Independent keys, including nested keys, merge without dropping concurrent additions.
- Keys containing dots, slashes or `__proto__` are literal JSON keys.
- Scalars, arrays, type changes and whole-object deletions are atomic changes.
- Incompatible concurrent changes fail with `E_ATTACHMENT_METADATA_CONFLICT` and a path.
- An unchanged patch does not rewrite JSON or backfill IDs.
- An original or variant replaced since loading cannot receive an obsolete metadata patch.

The legacy facade detects edits to both original and variant `meta` on model save.
Shared workers route extraction results through the same patching mechanism.

## Validation scope and limitations

The server matrix covers schema/foreign keys, table operations and JSON scenarios,
including legacy singular/collection assignment, worker variants, concurrent array and metadata edits, serialization,
refresh, nested rollback and deletion. Server concurrency tests use up to eight connections;
the JSON SQLite-family matrix uses one connection and does not certify multi-process
contention behavior. Separate local tests exercise document validation, metadata conflicts,
memory workers, mixed-model atomicity, module boundaries and failure/cleanup paths.

No test suite guarantees behavior under every outage, isolation level or server version.
Memory jobs are not durable across process termination. Bulk SQL updates/deletes bypass
attachment hooks. Pause v5 writers/jobs during migration and keep database **and file**
backups; this is not a safe concurrent-writing protocol for the old v5 package.
