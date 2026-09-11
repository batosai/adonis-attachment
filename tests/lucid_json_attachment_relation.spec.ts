import { setApp } from '@adonisjs/core/services/app'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import { AttachmentService } from '../src/core/attachment_service.js'
import type { AttachmentJob } from '../src/core/queue.js'
import { attachment, attachments, AttachmentRelation, AttachmentCollectionRelation, JsonAttachmentEntry } from '../src/integrations/lucid/index.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'

class JsonUser extends BaseModel {
  static table = 'json_users'
  static selfAssignPrimaryKey = true
  @column({ isPrimary: true, columnName: 'user_key' }) declare id: string
  @column() declare name: string
  @attachment<JsonUser>({ persistence: 'json', type: 'users', columnName: 'avatar_json', preComputeUrl: true, rename: false, folder: ({ model }) => `users/${model!.id}` })
  declare avatar: AttachmentRelation<'json'>
  @attachments({ persistence: 'json', variants: [] }) declare gallery: AttachmentCollectionRelation<'json'>
  @attachment({ variants: [] }) declare document: AttachmentRelation
}

test.group('Lucid JSON attachment relations', (group) => {
  let db: Awaited<ReturnType<typeof createLucidTestDatabase>>
  let service: AttachmentService
  const files = new Set<string>()
  const jobs: AttachmentJob[] = []
  const draft = (name: string) => service.createDraft({ originalName: name, body: new Uint8Array([1]) }, { variants: [] })
  const user = async () => { const row = new JsonUser(); row.id = '42'; row.name = 'Alice'; await row.save(); return row }
  const raw = () => db.from('json_users').where('user_key', '42').first()
  group.setup(async () => {
    db = await createLucidTestDatabase()
    JsonUser.useAdapter(db.modelAdapter())
    await db.connection().schema.createTable('json_users', (table) => {
      table.string('user_key').primary(); table.string('name').unique(); table.text('avatar_json'); table.text('gallery')
    })
  })
  group.each.setup(async () => {
    await db.from('adonis_attachment_links').delete(); await db.from('adonis_attachments').delete(); await db.from('json_users').delete()
    files.clear(); jobs.length = 0
    service = new AttachmentService({
      defaultDisk: 'fs', queue: { async enqueue(job) { jobs.push(job) } },
      storage: {
        async write(value) { files.add(value.path) }, async read() { return new Uint8Array([1]) },
        async remove(value) { files.delete(value.path) }, async getUrl(value) { return `https://cdn.test/${value.path}` },
      },
    })
    setApp({ container: { async make() { return service } } } as never)
  })
  group.teardown(async () => { await db.manager.closeAll() })

  test('persists JSON and table fields together on a newly saved model', async ({ assert }) => {
    const row = new JsonUser(); row.id = '42'; row.name = 'Alice'
    row.avatar.set(draft('avatar.jpg')); row.gallery.add(draft('gallery.jpg')); row.document.set(draft('doc.txt'))
    await row.save()
    const avatar = (await row.avatar.get())!
    assert.instanceOf(avatar, JsonAttachmentEntry)
    assert.equal(avatar.toAttachment().path, 'users/42/avatar.jpg')
    assert.equal(avatar.toAttachment().url, 'https://cdn.test/users/42/avatar.jpg')
    assert.deepEqual(avatar.toAttachment().reference?.owner, { type: 'users', id: '42', field: 'avatar' })
    assert.equal(JSON.parse((await raw()).avatar_json).id, avatar.id)
    assert.equal(row.$extras.avatar_json, (await raw()).avatar_json)
    assert.notProperty(row.$attributes, 'avatar')
    assert.isFalse(row.$isDirty)
    assert.lengthOf(await row.gallery.all(), 1)
    assert.equal((await row.document.get())!.attachment.disk, 'fs')
    assert.lengthOf(await db.from('adonis_attachments'), 1)
  })

  test('does not overwrite a worker update when saving a stale model or filling other attributes', async ({ assert }) => {
    const row = await user(); row.avatar.set(draft('old.jpg')); await row.save()
    const stale = await JsonUser.findOrFail('42')
    row.avatar.set(draft('new.jpg')); await row.save()
    const latest = (await raw()).avatar_json
    stale.fill({ id: '42', name: 'Bob' }); await stale.save()
    assert.equal((await raw()).avatar_json, latest)
    assert.equal((await stale.avatar.get())!.toAttachment().originalName, 'new.jpg')
    assert.equal(stale.$extras.avatar_json, latest)
  })

  test('restores pending operations, JSON snapshots and files after outer rollback', async ({ assert }) => {
    const row = await user(); row.avatar.set(draft('old.jpg')); await row.save()
    const before = row.$extras.avatar_json
    const replacement = draft('new.jpg')
    const trx = await db.transaction()
    try {
      row.useTransaction(trx); row.avatar.set(replacement); await row.save()
      assert.notEqual(row.$extras.avatar_json, before)
      assert.isTrue(files.has('users/42/old.jpg'))
      await trx.rollback()
      assert.equal(row.$extras.avatar_json, before)
      assert.isTrue(row.avatar.hasPending)
      assert.isFalse(replacement.isPersisted)
      assert.isFalse(files.has('users/42/new.jpg'))
      assert.equal((await raw()).avatar_json, before)
      await row.save()
      assert.isFalse(files.has('users/42/old.jpg'))
    } finally { if (!trx.isCompleted) await trx.rollback() }
  })

  test('rolls back all fields and the inserted owner when a later attachment fails', async ({ assert }) => {
    const row = new JsonUser(); row.id = '42'; row.name = 'Alice'
    const first = draft('first.jpg')
    row.avatar.set(first); row.document.attachExisting('missing')
    await assert.rejects(() => row.save(), /not found/)
    assert.isNull(await raw())
    assert.isFalse(row.$isPersisted)
    assert.isFalse(first.isPersisted)
    assert.isEmpty(files)
    assert.isTrue(row.avatar.hasPending)
    assert.notProperty(row.$extras, 'avatar_json')
  })

  test('orders and removes a JSON collection with the same staged relation API', async ({ assert }) => {
    const row = await user(); row.gallery.addMany([draft('a.jpg'), draft('b.jpg')]); await row.save()
    const [a, b] = await row.gallery.all()
    row.gallery.move(b!.id, 0); await row.save()
    assert.deepEqual((await row.gallery.all()).map((item) => item.id), [b!.id, a!.id])
    row.gallery.remove(a!.id); await row.save()
    assert.isFalse(files.has(a!.toAttachment().path))
    row.gallery.clear(); await row.save()
    assert.equal((await raw()).gallery, '[]')
  })

  test('purges mixed fields on delete only after commit and restores them on rollback', async ({ assert }) => {
    const row = await user(); row.avatar.set(draft('avatar.jpg')); row.gallery.add(draft('photo.jpg')); row.document.set(draft('doc.txt')); await row.save()
    const trx = await db.transaction()
    try {
      row.useTransaction(trx); await row.delete()
      assert.equal(files.size, 3)
      await trx.rollback()
      assert.isFalse(row.$isDeleted)
      assert.equal((await row.avatar.get())!.toAttachment().originalName, 'avatar.jpg')
      await row.delete()
      assert.isNull(await raw())
      assert.isEmpty(files)
      assert.isEmpty(await db.from('adonis_attachments'))
    } finally { if (!trx.isCompleted) await trx.rollback() }
  })

  test('queues contextual regeneration and refuses JSON sharing', async ({ assert }) => {
    const row = await user(); row.avatar.set(draft('avatar.jpg')); await row.save()
    assert.isTrue(await row.avatar.regenerateVariants(['thumbnail']))
    assert.equal(jobs[0]!.reference?.adapter, 'json')
    row.gallery.addExisting((await row.avatar.get())!.id)
    await assert.rejects(() => row.save(), /link operations require/)
  })

  test('rejects ordinary column aliases and two fields managing the same JSON column', async ({ assert }) => {
    class Invalid extends BaseModel { @column() declare avatar: string }
    assert.throws(() => attachment({ persistence: 'json' })(Invalid.prototype, 'avatar'), /must not also be declared/)
    class Duplicate extends BaseModel {}
    attachment({ persistence: 'json', columnName: 'data' })(Duplicate.prototype, 'first')
    assert.throws(() => attachment({ persistence: 'json', columnName: 'data' })(Duplicate.prototype, 'second'), /same JSON column/)
    // Check again at save time, even if the ordinary column was declared later.
    class Late extends BaseModel { static table = 'json_users'; @column({ isPrimary: true, columnName: 'user_key' }) declare id: string }
    Late.useAdapter(db.modelAdapter())
    attachment({ persistence: 'json', columnName: 'avatar_json' })(Late.prototype, 'avatar')
    column({ columnName: 'avatar_json' })(Late.prototype, 'rawAvatar')
    const row = new Late(); row.id = '42'
    await assert.rejects(() => row.save(), /must not also be declared/)
  })
})
