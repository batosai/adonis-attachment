# Installation

Install the package in an AdonisJS 7 application.

```sh
npm install @jrmc/adonis-attachment
node ace add @jrmc/adonis-attachment
```

The configure hook creates `config/attachment.ts`, registers the attachment provider, and adds the package command loader. The generated config uses the Drive adapter; replace it with custom storage when Drive is not used.

Install optional packages only when their integration is enabled:

```sh
npm install @adonisjs/drive
npm install @adonisjs/lucid
npm install @adonisjs/queue
```
