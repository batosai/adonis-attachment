# Migration setup

Often times, the size of the image metadata could exceed the allowable length of an SQL `String` data type. So, it is recommended to create/modify the column which will hold the metadata to use a `JSON` data type.

If you are creating the column for the first time, make sure that you use the JSON data type. Example:

```ts
// Within the migration file

protected tableName = 'users'

public async up() {
  this.schema.createTable(this.tableName, (table) => {
    table.increments()
    table.json('avatar') // <-- Use a JSON data type
  })
}
```

If you already have a column for storing image paths/URLs, you need to create a new migration and alter the column definition to a JSON data type. Example:

```bash
# Create a new migration file
node ace make:migration change_avatar_column_to_json --table=users
```

```ts
// Within the migration file

protected tableName = 'users'

public async up() {
  this.schema.alterTable(this.tableName, (table) => {
    table.json('avatar').alter() // <-- Alter the column definition
  })
}
```
