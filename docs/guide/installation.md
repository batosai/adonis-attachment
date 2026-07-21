# Installation

## Requirements

- **AdonisJS 7** (Core is the only hard dependency)
- **Node.js 24+**

## Install

```sh
node ace add @jrmc/adonis-attachment
```

The `add` command runs the configure hook, which:

- creates `config/attachment.ts` (using local filesystem storage by default),
- registers the attachment provider in `adonisrc.ts`,
- registers the package's Ace commands (`make:attachments-table`, `make:attachment-v5-migration`).

That's enough to start creating attachments. Everything below is optional.

## Optional integrations

Install these only when you actually enable the matching feature.

| Package | Enables |
| --- | --- |
| `@adonisjs/drive` | Storing files on S3, GCS, or Drive's local disk - see [Configuration](/guide/configuration#storage). |
| `@adonisjs/lucid` | Database-backed persistence, relations, and variants - see [With Lucid](/guide/lucid). |
| `@adonisjs/queue` | Processing variant jobs with a real worker - see [Background processing](/guide/queues). |

```sh
npm install @adonisjs/drive   # object storage
npm install @adonisjs/lucid   # database persistence
npm install @adonisjs/queue   # background workers
```

::: tip
You don't need `@adonisjs/queue` just to generate variants - an in-memory queue ships with
the package and runs jobs in the same process. Add the real queue when you outgrow it.
:::

**Next:** [Configuration](/guide/configuration).
