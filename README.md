# Adonis Attachment

Attachment primitives for AdonisJS 7. Version 6 separates file storage, persistence, variants, and queues while keeping Lucid optional.

This branch is currently published as a `6.0.0-alpha` refactor.

## Installation

```sh
npm install @jrmc/adonis-attachment
node ace add @jrmc/adonis-attachment
```

Configure storage in `config/attachment.ts`, then add Lucid, Drive, or `@adonisjs/queue` only when the application uses those integrations.

## Documentation

The VitePress guide in [`docs`](./docs) covers configuration, Lucid persistence, custom persistence, queues, routes, variants, and migration from v5.

## License

MIT
