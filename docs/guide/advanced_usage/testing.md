# Testing

## Using `db.assertHas()` with attachment fields

::: info
`db.assertHas()` is available starting from **@adonisjs/lucid v22**.
:::

When writing tests with AdonisJS, `db.assertHas()` compares values as stored in the database. Since attachment fields are persisted as JSON strings, passing an `Attachment` object directly will cause a type mismatch error:

```
Comparing two different types of values. Expected string but received number.
```

Use `toDbString()` to serialize the attachment exactly as it is stored in the database:

```typescript
import { test } from '@japa/runner'

test('upload avatar', async ({ client, db }) => {
  const user = await User.create({ ... })

  // ... upload logic ...

  await db.assertHas('users', {
    id: user.id,
    avatar: user.avatar.toDbString(), // ✅ serializes to the JSON string stored in DB
  })
})
```

`toDbString()` returns the JSON string representation of the attachment, excluding internal fields like `keyId`. It matches exactly what is written to the database column.

::: tip
`toDbString()` is available on both single attachment and each item in an attachments array.

```typescript
// Single attachment
avatar: user.avatar.toDbString()

// Multiple attachments
documents: JSON.stringify(user.documents.map((d) => JSON.parse(d.toDbString())))
```
:::

::: info
`assert.deepEqual()` on model instances continues to work without `toDbString()` since it compares the deserialized objects directly:

```typescript
const fresh = await User.find(user.id)
assert.deepEqual(fresh.avatar, user.avatar) // ✅ works fine
```
:::
