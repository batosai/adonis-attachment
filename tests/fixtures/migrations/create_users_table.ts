/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */
import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  protected tableName = 'users'
  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name')
      table.json('avatar')
      table.json('avatar_2')
      table.json('weekend_pics')
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }
  async down() {
    this.schema.dropTable(this.tableName)
  }
}
