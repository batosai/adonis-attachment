# Installation

Install the package in an AdonisJS 7 application.

```sh
npm install @jrmc/adonis-attachment
node ace add @jrmc/adonis-attachment
```

The configure hook registers the attachment provider and the `make:attachments-table` command. Create `config/attachment.ts` next, then select the integrations your application uses.

Install optional packages only when their integration is enabled:

```sh
npm install @adonisjs/drive
npm install @adonisjs/lucid
npm install @adonisjs/queue
```
