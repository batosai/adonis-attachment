# AdonisJS attachment

This package is currently development and will replace [attachment-advanced](https://github.com/batosai/attachment-advanced) for AdonisJS 6.

Project sample : [adonis-starter-kit](https://github.com/batosai/adonis-starter-kit)

## Links

[View documentation](https://adonis-attachment.jrmc.dev/)
[Discord](https://discord.gg/89eMn2vB)

[ChangeLog](https://adonis-attachment.jrmc.dev/changelog.html)

⚠️ [Breaking change](https://adonis-attachment.jrmc.dev/changelog.html) version 2, include [@adonisjs/drive](https://docs.adonisjs.com/guides/digging-deeper/drive)

## Roadmap

- [x] attachment file by file system
- [x] save meta data
- [x] variantes
  - [x] images
  - [x] documents thumbnail
  - [x] videos thumbnail
- [ ] command regenerate
- [x] adonis-drive/flydrive
- [ ] jobs queue
- [x] serialize

### Meta data list (if available)

- extension name
- size
- dimension (width, height)
- created date
- orientation
- mime type
- gps

### Variants

Configure differents images sizes and formats

### Regenerate (coming soon)

Regenerate variantes files

### Drive

Use [@adonisjs/drive](https://docs.adonisjs.com/guides/digging-deeper/drive) for private file and cloud services

### Jobs queue (coming soon)

Couple with a job queue (recommended, optional)

## Setup

Install and configure the package:

```sh
node ace add @jrmc/adonis-attachment
```

