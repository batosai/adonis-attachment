# Agent Skills

If you use an AI coding agent ([Claude Code](https://claude.com/claude-code), Cursor, Codex...), this package ships [agent skills](https://agentskills.io) that teach it the current API of `@jrmc/adonis-attachment`.

Without them, agents tend to rely on outdated knowledge (old config structure, removed wrapper packages, wrong option names). The skills are versioned with the package source, so they always match the released API.

## Installation

Run this in your AdonisJS project:

```sh
npx skills add batosai/adonis-attachment
```

The CLI lets you pick which skills to install and copies them into your project (e.g. `.claude/skills/` for Claude Code). Your agent will then load them automatically when the task matches.

## Available skills

### `adonis-attachment`

The core skill, covering the full integration flow:

- installation and JSON column migration
- `@attachment` / `@attachments` decorators and all their options (`folder`, `disk`, `variants`, `meta`, `rename`, `preComputeUrl`, `serializeAs`, `serialize`)
- creating attachments from file, buffer, base64, path, URL or stream
- serving files: direct URLs (`getUrl()`, signed URLs, `preComputeUrl`) recommended for image SEO, attachments route as an alternative
- the Attachment object API and error handling

Use it for tasks like *"add an avatar upload to my User model"*.

### `adonis-attachment-variants`

Everything related to variants and converters:

- converter configuration and typing (`InferConverters`)
- image converter (resize, format, `autoOrient`, blurhash)
- video / PDF / document thumbnails, required system binaries and `bin` paths
- custom converters (`node ace make:converter`)
- variant storage paths, queue, lifecycle events and `RegenerateService`

### `adonis-attachment-migration`

Breaking changes for each major version (v1 → v5), plus notes for coming from `attachment-advanced`. Useful because version upgrades are where agents hallucinate the most — they mix APIs from different versions.

## Keeping skills up to date

Re-run the install command after upgrading the package to a new major version:

```sh
npx skills add batosai/adonis-attachment
```
