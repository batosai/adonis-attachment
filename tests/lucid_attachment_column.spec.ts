/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Database } from '@adonisjs/lucid/database'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { setApp } from '@adonisjs/core/services/app'
import { test } from '@japa/runner'

import { attachment } from '../index.js'
import type { Attachment } from '../src/core/attachment.js'
import { AttachmentService } from '../src/core/attachment_service.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'

class ColumnUser extends BaseModel {
  static table = 'column_users'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @attachment()
  declare avatar: Attachment | null
}

let database: Database
let attachments: AttachmentService
let removed: string[]

async function createAttachment(name: string): Promise<Attachment> {
  return attachments.create({
    body: Buffer.from(name),
    originalName: name,
    mimeType: 'text/plain',
  })
}

test.group('Lucid attachment column', (group) => {
  group.setup(async () => {
    database = await createLucidTestDatabase()
    ColumnUser.useAdapter(database.modelAdapter())
    await database.connection().schema.createTable('column_users', (table) => {
      table.string('id').primary()
      table.string('name').notNullable().unique()
      table.json('avatar').nullable()
    })
  })

  group.each.setup(async () => {
    removed = []
    await database.from('column_users').delete()
    attachments = new AttachmentService({
      defaultDisk: 'fs',
      queue: { async enqueue() {} },
      storage: {
        async write() {},
        async read() {
          return new Uint8Array()
        },
        async remove(location) {
          removed.push(location.path)
        },
      },
    })
    setApp({
      container: {
        async make(binding: string) {
          if (binding !== 'jrmc.attachment') {
            throw new Error(`Unexpected binding: ${binding}`)
          }

          return attachments
        },
      },
    } as never)
  })

  group.teardown(async () => {
    await database.manager.closeAll()
  })

  test('serializes an attachment and removes the replaced file after save', async ({ assert }) => {
    const first = await createAttachment('first.txt')
    const user = new ColumnUser()
    user.id = 'user-1'
    user.name = 'Jeremy'
    user.avatar = first
    await user.save()

    const reloaded = await ColumnUser.findOrFail(user.id)
    assert.deepEqual(reloaded.avatar, first)
    assert.deepEqual(removed, [])

    const replacement = await createAttachment('replacement.txt')
    user.avatar = replacement
    await user.save()

    assert.deepEqual(removed, [first.path])
  })

  test('removes a newly assigned file when save fails', async ({ assert }) => {
    const existing = new ColumnUser()
    existing.id = 'user-1'
    existing.name = 'Jeremy'
    existing.avatar = await createAttachment('existing.txt')
    await existing.save()
    removed = []

    const failedAttachment = await createAttachment('failed.txt')
    const duplicate = new ColumnUser()
    duplicate.id = 'user-1'
    duplicate.name = 'Duplicate'
    duplicate.avatar = failedAttachment

    await assert.rejects(() => duplicate.save(), /UNIQUE constraint failed/)

    assert.deepEqual(removed, [failedAttachment.path])
  })

  test('removes a newly assigned file when its transaction rolls back', async ({ assert }) => {
    const pendingAttachment = await createAttachment('rollback.txt')

    await assert.rejects(
      () =>
        database.transaction(async (trx) => {
          const user = new ColumnUser()
          user.id = 'user-1'
          user.name = 'Jeremy'
          user.avatar = pendingAttachment
          user.useTransaction(trx)
          await user.save()

          throw new Error('Rollback requested')
        }),
      /Rollback requested/
    )

    assert.deepEqual(removed, [pendingAttachment.path])
  })

  test('removes the attachment after deleting its owner', async ({ assert }) => {
    const avatar = await createAttachment('avatar.txt')
    const user = new ColumnUser()
    user.id = 'user-1'
    user.name = 'Jeremy'
    user.avatar = avatar
    await user.save()
    removed = []

    await user.delete()

    assert.deepEqual(removed, [avatar.path])
  })
})
