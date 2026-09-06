# Agent skills

The v6 package includes skills for AI coding agents working **in your AdonisJS application**.
They explain the public API and practical workflows, not how to develop this package.
Each skill includes its own references and can be installed independently.

## Available skills

| Skill | Use it for |
| --- | --- |
| `adonis-attachment` | Uploads, source options, Lucid relations, custom persistence, replacement, deletion, and URLs |
| `adonis-attachment-media` | Variants, converters, metadata, binaries, blurhash, named queues, workers, and regeneration |
| `adonis-attachment-migration` | V5 JSON mapping, v6 blob/link tables, migration execution, verification, and recovery precautions |

These skills target v6, AdonisJS 7, and Node.js 24+. They ask the agent to check your installed
version and configuration first; they do not authorize an automatic major-version upgrade.

## Install in your project

After installing a v6 package release that includes `skills`, run from your application root:

```sh
npx skills add ./node_modules/@jrmc/adonis-attachment/skills --list
npx skills add ./node_modules/@jrmc/adonis-attachment/skills
```

Select the skills and coding agents in the installer. Installation is project-local by default.
For an explicit selection, for example:

```sh
npx skills add ./node_modules/@jrmc/adonis-attachment/skills --skill adonis-attachment --agent codex
```

The [Skills CLI](https://github.com/vercel-labs/skills#readme) supports local folders, skill
selection, and agent selection. No global installation or change to the package's runtime
configuration is required. Merely running `npm install` does not activate the skills in an agent.

For local alpha testing before publication, use the path to the v6 checkout instead:

```sh
npx skills add /absolute/path/to/refont/skills --list
npx skills add /absolute/path/to/refont/skills
```

Use the installed package or a known v6 source, not the repository's unspecified default
branch: that branch may still contain v5 skills. Keep the v5 skills for v5 projects only.

## Use and update

Ask your agent to add an avatar, configure PDF thumbnails, diagnose a metadata failure,
or prepare a v5 migration. The descriptions let it select the relevant skill; you can also
mention the installed skill by name. The media and migration skills do not require the
core skill to be installed to read their references.

After upgrading the package, rerun the installation command from its updated `skills`
directory. Installed copies do not automatically follow npm updates. Remove obsolete v5
instructions from the project's agent configuration after upgrading, rather than leaving
both versions active. Review installation changes before committing them with your app.

Skill examples are typechecked against public package exports in the package test suite.
They still need the consuming application's authorization, schema, and configuration;
they are not permission to run production migrations or delete application files.
