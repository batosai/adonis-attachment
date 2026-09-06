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
- registers the package's Ace commands (`make:attachments-table`, `make:attachment-v5-migration`, `make:converter`).

That's enough to start creating attachments. Everything below is optional.

## Optional integrations

Install these only when you actually enable the matching feature.

| Package | Enables |
| --- | --- |
| `@adonisjs/drive` | Storing files on S3, GCS, or Drive's local disk - see [Configuration](/guide/configuration#storage). |
| `@adonisjs/lucid` | Database-backed persistence, relations, and variants - see [With Lucid](/guide/lucid). |
| `@adonisjs/queue` | Processing variant jobs with a real worker - see [Background processing](/guide/queues). |

```sh
node ace add @adonisjs/drive   # object storage
node ace add @adonisjs/lucid   # database persistence
node ace add @adonisjs/queue   # background workers
```

Run only the commands for integrations you need and complete their configuration prompts.
Installing an integration with `npm install` alone does not register its provider.

Media features have separate optional dependencies:

```sh
npm install sharp       # image conversion and technical metadata (including SVG)
npm install exifreader  # EXIF metadata when enabled
npm install blurhash    # blurhash when enabled (also requires sharp)
```

Video, PDF, and Office processing use system executables; see the
[requirements by source format](/guide/variants#autodetection) and
[binary paths](/guide/configuration#media-binaries).

::: tip
You don't need `@adonisjs/queue` just to generate variants - an in-memory queue ships with
the package and runs jobs in the same process. Add the real queue when you outgrow it.
:::

**Next:** [Configuration](/guide/configuration).
