/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { attachment, attachments } from '../src/decorators/attachment.js'
import type { Attachment } from '../src/types/attachment.js'
import { createApp } from './helpers/app.js'
import { makeAttachment } from './helpers/index.js'
import { bufferToTempFile, downloadToTempFile } from '../src/utils/helpers.js'
import { readFile, rm } from 'node:fs/promises'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import sinon from 'sinon'
import BlurhashAdapter from '../src/adapters/blurhash.js'
import VariantService from '../src/services/variant_service.js'
import AttachmentRecordService from '../src/services/attachment_service.js'
import attachmentManager from '../services/main.js'
import { optionsSym } from '../src/utils/symbols.js'
import encryption from '@adonisjs/core/services/encryption'
import AttachmentsController from '../src/controllers/attachments_controller.js'

class ReviewUser extends BaseModel {
  static table = 'users'
  @column() declare name: string
  @column({ isPrimary: true }) declare id: number
  @attachment({ rename: false }) declare avatar: Attachment | null
  @attachments({ columnName: 'weekend_pics', serializeAs: null }) declare photos: Attachment[]
}

test.group('review regressions', () => {
  for (const operation of ['save', 'delete'] as const) {
    test(`preserves files when SQL ${operation} fails`, async ({ assert, cleanup }) => {
      const app = await createApp()
      cleanup(() => app.terminate())
      const user = await ReviewUser.create({ avatar: await makeAttachment() })
      const original = user.avatar!.path!
      await db.rawQuery(
        `CREATE TRIGGER reject_attachment BEFORE ${operation === 'save' ? 'UPDATE' : 'DELETE'} ON users BEGIN SELECT RAISE(ABORT, 'rejected'); END`
      )
      cleanup(() => db.rawQuery('DROP TRIGGER IF EXISTS reject_attachment'))
      if (operation === 'save') user.avatar = await makeAttachment()
      await assert.rejects(() => user[operation](), /rejected/)
      await assert.fileExists(original)
      assert.exists((await db.from('users').where('id', user.id).first()).avatar)
    })
  }

  test('restores renamed files after transaction rollback', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const user = await ReviewUser.create({ avatar: await makeAttachment() })
    const original = user.avatar!.path!
    const bytes = await user.avatar!.getBuffer()
    const trx = await db.transaction()
    user.useTransaction(trx)
    user.avatar = await makeAttachment()
    await user.save()
    await trx.rollback()
    await assert.fileExists(original)
    assert.deepEqual(await user.avatar!.getBuffer(), bytes)
  })

  for (const rollback of [false, true]) {
    test(`S3 move failure supports ${rollback ? 'rollback' : 'commit'}`, async ({
      assert,
      cleanup,
    }) => {
      const app = await createApp()
      cleanup(() => app.terminate())
      const user = await ReviewUser.create({ avatar: await makeAttachment() })
      const original = user.avatar!
      const originalPath = original.path!
      const originalBytes = await original.getBuffer()
      const disk = original.getDisk()
      const move = sinon.stub(disk, 'move').rejects(new Error('ACL not supported'))
      cleanup(() => move.restore())
      const trx = await db.transaction()
      user.useTransaction(trx)
      const replacement = await makeAttachment()
      replacement.input = Buffer.from('replacement')
      user.avatar = replacement
      await user.save()
      const backupPath = original.path!
      assert.notEqual(backupPath, originalPath)
      assert.deepEqual(Buffer.from(await disk.getBytes(backupPath)), originalBytes)
      if (rollback) {
        await trx.rollback()
        assert.deepEqual(Buffer.from(await disk.getBytes(originalPath)), originalBytes)
      } else {
        await trx.commit()
        assert.equal(Buffer.from(await disk.getBytes(originalPath)).toString(), 'replacement')
      }
      await assert.fileNotExists(backupPath)
      assert.isTrue(move.called)
    })
  }

  test('failed S3 backup keeps the original file', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const user = await ReviewUser.create({ avatar: await makeAttachment() })
    const original = user.avatar!
    const originalPath = original.path!
    const bytes = await original.getBuffer()
    const disk = original.getDisk()
    const move = sinon.stub(disk, 'move').rejects(new Error('ACL not supported'))
    const put = sinon.stub(disk, 'putStream').rejects(new Error('upload failed'))
    cleanup(() => {
      move.restore()
      put.restore()
    })
    user.avatar = await makeAttachment()
    await assert.rejects(() => user.save(), /upload failed/)
    assert.deepEqual(Buffer.from(await disk.getBytes(originalPath)), bytes)
  })

  for (const rollback of [true, false]) {
    test(`multiple replacements support ${rollback ? 'rollback' : 'commit'}`, async ({
      assert,
      cleanup,
    }) => {
      const app = await createApp()
      cleanup(() => app.terminate())
      const user = await ReviewUser.create({ avatar: await makeAttachment() })
      const original = user.avatar!
      const disk = original.getDisk()
      const originalPath = original.path!
      const originalBytes = await original.getBuffer()
      const trx = await db.transaction()
      user.useTransaction(trx)
      const second = await makeAttachment()
      second.input = Buffer.from('second')
      user.avatar = second
      await user.save()
      const third = await makeAttachment()
      third.input = Buffer.from('third')
      user.avatar = third
      await user.save()
      const backups = [original.path!, second.path!]
      if (rollback) await trx.rollback()
      else await trx.commit()
      assert.deepEqual(
        Buffer.from(await disk.getBytes(originalPath)),
        rollback ? originalBytes : Buffer.from('third')
      )
      for (const backup of backups) await assert.fileNotExists(backup)
    })
  }

  test('a text-only save preserves pending variant generation', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const trx = await db.transaction()
    const user = new ReviewUser()
    user.useTransaction(trx)
    user.avatar = await makeAttachment()
    await user.save()
    user.name = 'updated'
    await user.save()
    const spy = sinon.spy(attachmentManager.queue, 'push')
    cleanup(() => spy.restore())
    const drained = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await trx.commit()
    await drained
    assert.equal(spy.callCount, 1)
  })

  test('waits for in-flight uploads before rollback', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const avatar = await makeAttachment()
    const photo = await makeAttachment()
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const originalPut = photo.put.bind(photo)
    sinon.stub(avatar, 'put').callsFake(async () => {
      await started
      throw new Error('upload failed')
    })
    sinon.stub(photo, 'put').callsFake(async () => {
      entered()
      await barrier
      await originalPut()
    })
    const user = new ReviewUser()
    user.avatar = avatar
    user.photos = [photo]
    let finished = false
    const pending = user.save().then(
      () => {
        finished = true
      },
      (error) => {
        finished = true
        return error
      }
    )
    await started
    await new Promise((resolve) => setImmediate(resolve))
    assert.isFalse(finished)
    release()
    const error = await pending
    assert.match(error.message, /upload failed/)
    await assert.fileNotExists(photo.path!)
    await assert.fileNotExists(avatar.path!)
  })

  test('child attachment options do not mutate parents or siblings', async ({
    assert,
    cleanup,
  }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    class Parent extends BaseModel {
      static table = 'users'
    }
    attachment({ folder: 'parent' })(Parent.prototype, 'avatar')
    class Child extends Parent {}
    class Sibling extends Parent {}
    attachment({ folder: 'child' })(Child.prototype, 'avatar')
    attachment({ folder: 'sibling' })(Sibling.prototype, 'avatar')
    assert.equal((Parent.prototype as any)[optionsSym].avatar.folder, 'parent')
    assert.equal((Child.prototype as any)[optionsSym].avatar.folder, 'child')
    assert.equal((Sibling.prototype as any)[optionsSym].avatar.folder, 'sibling')
  })

  for (const hook of ['create', 'update'] as const) {
    test(`transaction restores files when after:${hook} fails`, async ({ assert, cleanup }) => {
      const app = await createApp()
      cleanup(() => app.terminate())
      class HookUser extends BaseModel {
        static table = 'users'
        @column({ isPrimary: true }) declare id: number
        @attachment({ rename: false }) declare avatar: Attachment
      }
      const user =
        hook === 'update'
          ? await HookUser.create({ avatar: await makeAttachment() })
          : new HookUser()
      const old = user.avatar
      const bytes = old ? await old.getBuffer() : undefined
      HookUser.after(hook, () => {
        throw new Error('hook failed')
      })
      const trx = await db.transaction()
      user.useTransaction(trx)
      user.avatar = await makeAttachment()
      user.avatar.input = Buffer.from('replacement')
      const disk = user.avatar.getDisk()
      await assert.rejects(() => user.save(), /hook failed/)
      const currentPath = user.avatar.path!
      const backupPath = old?.path
      await trx.rollback()
      if (bytes) assert.deepEqual(Buffer.from(await disk.getBytes(currentPath)), bytes)
      else await assert.fileNotExists(currentPath)
      if (backupPath) await assert.fileNotExists(backupPath)
    })
  }

  for (const remove of [false, true]) {
    test(`stale generation cannot overwrite ${remove ? 'deletion' : 'replacement'}`, async ({
      assert,
      cleanup,
    }) => {
      const app = await createApp()
      cleanup(() => app.terminate())
      const user = await ReviewUser.create({ photos: [await makeAttachment()] })
      const stale = user.photos[0]
      const record = new AttachmentRecordService(user as any)
      const service = new VariantService({
        record,
        attributeName: 'photos',
        options: { variants: ['thumbnail'] },
      })
      const manager = await app.container.make('jrmc.attachment')
      const converter = (await manager.getConverter('thumbnail'))!
      const handle = converter.handle.bind(converter)
      let release!: () => void
      let entered!: () => void
      const ready = new Promise<void>((resolve) => {
        entered = resolve
      })
      const barrier = new Promise<void>((resolve) => {
        release = resolve
      })
      const stub = sinon.stub(converter, 'handle').callsFake(async (args) => {
        entered()
        await barrier
        return handle(args)
      })
      const blurhash = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
      cleanup(() => {
        stub.restore()
        blurhash.restore()
      })
      const pending = service.run()
      await ready
      if (remove) await user.delete()
      else {
        const replacement = await makeAttachment()
        replacement.originalName = 'replacement.jpg'
        user.photos = [replacement]
        await user.save()
      }
      const current = await db.from('users').where('id', user.id).first()
      const rejection = assert.rejects(() => pending, /Attachment changed/)
      release()
      await rejection
      assert.deepEqual(await db.from('users').where('id', user.id).first(), current)
      assert.isEmpty(stale.variants ?? [])
    })
  }

  test('afterSave failure preserves the committed file', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    class HookUser extends BaseModel {
      static table = 'users'
      @column({ isPrimary: true }) declare id: number
      @attachment() declare avatar: Attachment
    }
    HookUser.after('save', () => {
      throw new Error('afterSave failed')
    })
    const user = new HookUser()
    user.avatar = await makeAttachment()
    await assert.rejects(() => user.save(), /afterSave failed/)
    await assert.fileExists(user.avatar.path!)
    assert.exists((await db.from('users').where('id', user.id).first()).avatar)
  })

  test('queues variants only after transaction commit', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const spy = sinon.spy(attachmentManager.queue, 'push')
    cleanup(() => spy.restore())
    const trx = await db.transaction()
    const user = new ReviewUser()
    user.useTransaction(trx)
    user.avatar = await makeAttachment()
    await user.save()
    assert.isFalse(spy.called)
    await trx.rollback()
    assert.isFalse(spy.called)
    const committed = await db.transaction()
    const another = new ReviewUser()
    another.useTransaction(committed)
    another.avatar = await makeAttachment()
    await another.save()
    assert.isFalse(spy.called)
    const drained = new Promise((resolve) => {
      attachmentManager.queue.drained = resolve
    })
    await committed.commit()
    await drained
    assert.isTrue(spy.called)
  })

  test('regeneration preserves old variants on converter failure and uses columnName', async ({
    assert,
    cleanup,
  }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const user = await ReviewUser.create({ photos: [await makeAttachment()] })
    const record = new AttachmentRecordService(user as any)
    const blurhash = sinon.stub(BlurhashAdapter, 'encode').returns('mockBlurhash')
    cleanup(() => blurhash.restore())
    const service = new VariantService({
      record,
      attributeName: 'photos',
      options: { variants: ['thumbnail'] },
    })
    await service.run()
    const previous = user.photos[0].variants![0]
    const stored = (await db.from('users').where('id', user.id).first()).weekend_pics
    const manager = await app.container.make('jrmc.attachment')
    const converter = await manager.getConverter('thumbnail')
    const stub = sinon.stub(converter!, 'handle').rejects(new Error('conversion failed'))
    cleanup(() => stub.restore())
    await assert.rejects(() => service.run(), /conversion failed/)
    await assert.fileExists(previous.path!)
    assert.equal((await db.from('users').where('id', user.id).first()).weekend_pics, stored)
    assert.strictEqual(user.photos[0].variants![0], previous)
    const data = encryption.decrypt(user.photos[0].getKeyId()!) as any
    assert.equal(data.attribute, 'weekend_pics')
  })

  test('awaits asynchronous attachment folders', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const user = await ReviewUser.create({ avatar: await makeAttachment() })
    const opts = (ReviewUser.prototype as any)[optionsSym].avatar
    cleanup(() => {
      ;(ReviewUser.prototype as any)[optionsSym].avatar = opts
    })
    let release!: () => void
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })
    ;(ReviewUser.prototype as any)[optionsSym].avatar = {
      folder: async () => {
        await ready
        return 'resolved-folder'
      },
    }
    let done = false
    const pending = new AttachmentRecordService(user as any)
      .getAttachments({ attributeName: 'avatar' })
      .then((result) => {
        done = true
        return result
      })
    await Promise.resolve()
    assert.isFalse(done)
    release()
    const result = await pending
    assert.equal(result[0].folder, 'resolved-folder')
  })

  test('preserves multiple attachment column and serialization options', async ({
    assert,
    cleanup,
  }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const user = await ReviewUser.create({ photos: [await makeAttachment()] })
    assert.notProperty(user.serialize(), 'photos')
    assert.lengthOf((await ReviewUser.findOrFail(user.id)).photos, 1)
  })

  test('isolates simultaneous temporary files', async ({ assert, cleanup }) => {
    const clock = sinon.stub(Date, 'now').returns(123)
    cleanup(() => clock.restore())
    const paths = await Promise.all([
      bufferToTempFile(Buffer.from('one')),
      bufferToTempFile(Buffer.from('two')),
    ])
    cleanup(() => Promise.all(paths.map((path) => rm(path))))
    assert.notEqual(paths[0], paths[1])
    assert.equal(await readFile(paths[0], 'utf8'), 'one')
    assert.equal(await readFile(paths[1], 'utf8'), 'two')
  })

  test('returns 404 for invalid and obsolete attachment links', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const user = await ReviewUser.create({ avatar: null })
    for (const key of [
      'invalid',
      encryption.encrypt({ model: 'users', primaryKey: 'id', attribute: 'avatar', id: -1 }),
      encryption.encrypt({ model: 'users', primaryKey: 'id', attribute: 'avatar', id: user.id }),
    ]) {
      const notFound = sinon.spy()
      await new AttachmentsController().handle({
        request: { params: () => ({ key }), qs: () => ({}) },
        response: { notFound },
      } as any)
      assert.isTrue(notFound.calledOnce)
    }
  })

  test('rejects non-success download responses', async ({ assert, cleanup }) => {
    const stub = sinon.stub(https, 'get').callsFake((_url: any, callback: any) => {
      queueMicrotask(() => callback({ statusCode: 404, resume() {} }))
      return new EventEmitter() as any
    })
    cleanup(() => stub.restore())
    await assert.rejects(() => downloadToTempFile(new URL('https://example.test/missing')), /404/)
  })

  test('rejects download network errors', async ({ assert, cleanup }) => {
    const request = new EventEmitter()
    const stub = sinon.stub(https, 'get').returns(request as any)
    cleanup(() => stub.restore())
    const pending = downloadToTempFile(new URL('https://example.test/image'))
    request.emit('error', new Error('network failed'))
    await assert.rejects(() => pending, /network failed/)
  })
})
