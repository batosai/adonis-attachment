# Lucid

Lucid is optional. When enabled, attachments and variants are stored in one polymorphic table. A variant references its original attachment through `parent_id`.

Create the migration:

```sh
node ace make:attachments-table
```

Use `--table=media_attachments` or `--folder=database/migrations` to customize the generated file.

`AttachmentModel` maps the default table and `LucidAttachmentStore` creates original and variant rows. `LucidAttachmentRepository` lets a queued worker resolve an attachment by id.
