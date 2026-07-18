export type RenderAttachmentsMigrationOptions = {
  tableName?: string
}

/**
 * Produces the Lucid migration source for the polymorphic attachment table.
 * The application owns the timestamped migration file and runs it with Lucid.
 */
export function renderAttachmentsMigration(
  options: RenderAttachmentsMigrationOptions = {}
): string {
  const tableName = options.tableName ?? 'attachments'

  if (!/^[a-z][a-z0-9_]*$/.test(tableName)) {
    throw new Error('Lucid attachment table names must be snake_case identifiers')
  }

  return `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class Create${toPascalCase(tableName)}Table extends BaseSchema {
  protected tableName = '${tableName}'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.string('attachable_type').notNullable()
      table.string('attachable_id').notNullable()
      table.string('field').notNullable()
      table.string('owner_key', 64).nullable().unique()
      table.uuid('parent_id').nullable().references('id').inTable(this.tableName).onDelete('CASCADE')
      table.string('variant_key').nullable()
      table.string('disk').notNullable()
      table.string('path').notNullable()
      table.string('name').notNullable()
      table.string('original_name').notNullable()
      table.string('mime_type').notNullable()
      table.string('extname').notNullable()
      table.bigInteger('size').unsigned().notNullable()
      table.json('metadata').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['attachable_type', 'attachable_id', 'field'])
      table.index(['parent_id'])
      table.unique(['parent_id', 'variant_key'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
`
}

function toPascalCase(value: string): string {
  return value.replace(/(^|_)([a-z0-9])/g, (_, _separator: string, character: string) =>
    character.toUpperCase()
  )
}
