# Regeneration of variants

You can regenerate the different variants using the `RegenerateService`.

⚠️ [change in v4.0.0](/changelog#_4-0-0)

## Regeneration by Row

```ts
  @inject()
  async regenerate(regenerate: RegenerateService) {
    const user = await User.first()

    if (user) {
      await regenerate.row(user).run()
    }
  }
```

## Regeneration by Model

```ts
  @inject()
  async regenerate(regenerate: RegenerateService) {
    if (user) {
      await regenerate.model(User).run()
    }
  }
```

## Options


| Option     | Description                  |
| ---------- | ---------------------------- |
| variants   | Specify the variant names    |
| attributes | Specify the attribute names. |   



```ts
  await regenerate.row(user, {
    variants: [ 'thumbnail' ],
    attributes: [ 'avatar', 'files' ]
  }).run()

  await regenerate.model(User, {
    variants: [ 'thumbnail' ],
    attributes: [ 'avatar', 'files' ]
  }).run()
```


