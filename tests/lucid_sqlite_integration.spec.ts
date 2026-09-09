/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { Database } from '@adonisjs/lucid/database'
import { test } from '@japa/runner'

import { defineConfig, MemoryAttachmentQueue, type AttachmentStorage } from '../index.js'
import type { Attachment } from '../src/core/attachment.js'
import { createLucidAttachmentProcessor } from '../src/integrations/lucid/create_lucid_attachment_processor.js'
import { AttachmentLinkModel } from '../src/integrations/lucid/models/attachment_link_model.js'
import { AttachmentModel } from '../src/integrations/lucid/models/attachment_model.js'
import { LucidAttachmentLifecycleService } from '../src/integrations/lucid/persistence/lucid_attachment_lifecycle_service.js'
import { LucidAttachmentRepository } from '../src/integrations/lucid/persistence/lucid_attachment_repository.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/persistence/lucid_attachment_store.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'

const owner = { type: 'users', id: '42', field: 'avatar' }
let database: Database

function makeAttachment(id: string, path: string, metadata?: Record<string, unknown>): Attachment {
  return {
    id,
    disk: 'public',
    path,
    name: path.split('/').at(-1)!,
    originalName: 'profile.jpg',
    mimeType: 'image/jpeg',
    extname: 'jpg',
    size: 42,
    ...(metadata ? { metadata } : {}),
  }
}

test.group('Lucid SQLite integration', (group) => {
  group.setup(async () => {
    database = await createLucidTestDatabase()
  })

  group.each.setup(async () => {
    await database.from('adonis_attachment_links').delete()
    await database.from('adonis_attachments').delete()
  })

  group.teardown(async () => {
    await database.manager.closeAll()
  })

  test('persists original rows and variants using the generated table schema', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const original = await store.createOriginal(
      owner,
      makeAttachment('original-id', 'users/42/avatar.jpg', { width: 800 })
    )
    const variant = await store.createVariant(
      original.attachment,
      'thumbnail',
      { ...makeAttachment('variant-id', 'users/42/thumbnail.jpg'), blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }
    )

    const reloaded = await AttachmentModel.findOrFail(original.attachmentId)
    const link = await AttachmentLinkModel.findOrFail(original.id)
    const persisted = await store.findByOwner(owner)

    assert.equal(link.attachableType, 'users')
    assert.equal(link.attachableId, '42')
    assert.equal(link.field, 'avatar')
    assert.deepEqual(reloaded.metadata, { width: 800 })
    assert.isNotNull(reloaded.createdAt)
    assert.isNotNull(reloaded.updatedAt)
    assert.equal(variant.parentId, original.attachmentId)
    assert.equal(variant.variantKey, 'thumbnail')
    assert.equal(variant.toAttachment().blurhash, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj')
    assert.equal(persisted?.original.id, original.id)
    assert.deepEqual(persisted?.variants.map((row) => row.id), ['variant-id'])
  })

  test('processes variants with the default Lucid memory processor', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const original = await store.createOriginal(owner, makeAttachment('original-id', 'users/42/avatar.jpg'))
    const storage: AttachmentStorage = {
      async write() {},
      async read() {
        return new Uint8Array()
      },
      async remove() {},
    }
    const attachmentService = {
      async read() {
        return new Uint8Array([1, 2, 3])
      },
      async create() {
        return makeAttachment('variant-id', 'users/42/thumbnail.webp')
      },
      async remove() {},
    }
    const app = {
      container: {
        hasBinding(binding: string) {
          return binding === 'lucid.db'
        },
        async make(binding: string) {
          assert.equal(binding, 'jrmc.attachment')
          return attachmentService
        },
      },
    }
    const resolved = await defineConfig({
      storage,
      converters: {
        thumbnail: {
          converter: async () => ({
            default: {
              key: 'ignored',
              async convert() {
                return {
                  body: new Uint8Array([4, 5, 6]),
                  fileName: 'thumbnail.webp',
                  mimeType: 'image/webp',
                }
              },
            },
          }),
        },
      },
    }).resolver(app as never)

    await resolved.queue.enqueue({
      type: 'generate-variants',
      attachmentId: original.attachmentId,
      variantKeys: ['thumbnail'],
    })
    await (resolved.queue as MemoryAttachmentQueue).drain()

    const variant = await AttachmentModel.query()
      .where('parent_id', original.attachmentId)
      .where('variant_key', 'thumbnail')
      .firstOrFail()
    assert.equal(variant.id, 'variant-id')
    assert.equal(variant.path, 'users/42/thumbnail.webp')
  })

  test('creates a standalone Lucid processor for external workers', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const original = await store.createOriginal(owner, makeAttachment('original-id', 'users/42/avatar.jpg'))
    const attachmentService = {
      async read() {
        return new Uint8Array([1, 2, 3])
      },
      async create() {
        return makeAttachment('worker-variant-id', 'users/42/worker-thumbnail.webp')
      },
      async remove() {},
    }
    const converter = {
      key: 'thumbnail',
      async convert() {
        return {
          body: new Uint8Array([4, 5, 6]),
          fileName: 'worker-thumbnail.webp',
          mimeType: 'image/webp',
        }
      },
    }
    const processor = createLucidAttachmentProcessor({
      container: {
        async make(binding: string) {
          if (binding === 'jrmc.attachment') {
            return attachmentService
          }
          if (binding === 'jrmc.attachment.converters') {
            return {
              async keys() {
                return ['thumbnail']
              },
              async get(key: string) {
                return key === 'thumbnail' ? converter : undefined
              },
            }
          }
          throw new Error(`Unexpected container binding: ${binding}`)
        },
      },
    } as never)

    await processor.process({
      type: 'generate-variants',
      attachmentId: original.attachmentId,
      variantKeys: ['thumbnail'],
    })

    const variant = await AttachmentModel.query()
      .where('parent_id', original.attachmentId)
      .where('variant_key', 'thumbnail')
      .firstOrFail()
    assert.equal(variant.id, 'worker-variant-id')
    assert.equal(variant.path, 'users/42/worker-thumbnail.webp')
  })

  test('returns null when no attachment exists for the owner field', async ({ assert }) => {
    const result = await new LucidAttachmentStore().findByOwner(owner)

    assert.isNull(result)
  })

  test('rejects owner links to variants and protects referenced blobs in SQL', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const original = await store.createOriginal(owner, makeAttachment('original', 'original.jpg'))
    const variant = await store.createVariant(original.attachment, 'thumb', makeAttachment('variant', 'variant.jpg'))
    const other = { ...owner, id: 'other' }
    await assert.rejects(() => store.createOriginalLink(other, variant.id), /Only original attachments/)
    await assert.rejects(() => store.createCollectionLink(other, variant.id), /Only original attachments/)
    await assert.rejects(() => AttachmentModel.query().where('id', original.attachmentId).delete(), /FOREIGN KEY/)
    assert.isNotNull(await store.findOriginal(owner))
    assert.isNotNull(await store.findById(variant.id))
  })

  test('preserves legacy variant links when removing their original would cascade', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const original = await store.createOriginal(owner, makeAttachment('original', 'original.jpg'))
    await store.createVariant(original.attachment, 'thumb', makeAttachment('variant', 'variant.jpg'))
    await AttachmentLinkModel.create({ id: 'legacy-link', attachableType: 'users', attachableId: 'other', field: 'avatar', attachmentId: 'variant' })
    await assert.rejects(() => store.remove(original), /variants have owner links/)
    assert.isNotNull(await store.findOriginal(owner))
    assert.isNotNull(await AttachmentLinkModel.find('legacy-link'))
  })

  test('serializes concurrent replacements of a variant including its initial creation', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const original = await store.createOriginal(owner, makeAttachment('original', 'original.jpg'))
    const results = await Promise.all(['a', 'b'].map((id) =>
      store.replaceVariant(original.attachment, 'thumb', makeAttachment(id, `${id}.jpg`))
    ))
    assert.lengthOf(await store.listVariants(original.attachmentId), 1)
    assert.equal(results[0]!.variant.id, results[1]!.variant.id)
    assert.lengthOf(results.filter((result) => result.replaced), 1)
  })

  test('prevents two original attachments for the same owner field', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    await store.createOriginal(owner, makeAttachment('first-id', 'users/42/first.jpg'))

    await assert.rejects(
      () => store.createOriginal(owner, makeAttachment('second-id', 'users/42/second.jpg')),
      /UNIQUE constraint failed/
    )
  })

  test('prevents duplicate variant keys for the same original', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const original = await store.createOriginal(owner, makeAttachment('original-id', 'users/42/avatar.jpg'))
    await store.createVariant(
      original.attachment,
      'thumbnail',
      makeAttachment('first-variant-id', 'users/42/thumbnail.jpg')
    )

    await assert.rejects(
      () =>
        store.createVariant(
          original.attachment,
          'thumbnail',
          makeAttachment('second-variant-id', 'users/42/thumbnail-2.jpg')
        ),
      /UNIQUE constraint failed/
    )
  })

  test('replaces an existing variant atomically while retaining its row identity', async ({ assert }) => {
    const store = new LucidAttachmentStore()
    const original = await store.createOriginal(owner, makeAttachment('original-id', 'users/42/avatar.jpg'))
    await store.createVariant(
      original.attachment,
      'thumbnail',
      makeAttachment('first-variant-id', 'users/42/thumbnail.jpg')
    )

    const replacement = makeAttachment('new-file-id', 'users/42/thumbnail.webp', { width: 320 })
    const result = await store.replaceVariant(original.attachment, 'thumbnail', replacement)
    const stored = await AttachmentModel.findOrFail('first-variant-id')

    assert.equal(result.variant.id, 'first-variant-id')
    assert.equal(result.replaced?.path, 'users/42/thumbnail.jpg')
    assert.equal(stored.path, 'users/42/thumbnail.webp')
    assert.equal(stored.mimeType, 'image/jpeg')
    assert.deepEqual(stored.metadata, { width: 320 })
    assert.isNull(await AttachmentModel.find('new-file-id'))
  })

  test('uses persisted rows for lifecycle replacement, deletion, and repository reads', async ({ assert }) => {
    const removed: string[] = []
    const attachments = [
      makeAttachment('first-id', 'users/42/first.jpg'),
      makeAttachment('second-id', 'users/42/second.jpg'),
    ]
    const lifecycle = new LucidAttachmentLifecycleService(
      {
        async create() {
          return attachments.shift()!
        },
        async remove(attachment) {
          removed.push(attachment.id)
        },
      },
      new LucidAttachmentStore()
    )

    const first = await lifecycle.attach(owner, {
      body: new Uint8Array(),
      originalName: 'profile.jpg',
    })
    const replacement = await lifecycle.replace(owner, {
      body: new Uint8Array(),
      originalName: 'profile.jpg',
    })
    await new LucidAttachmentStore().createVariant(
      replacement.attachment,
      'thumbnail',
      makeAttachment('variant-id', 'users/42/thumbnail.jpg')
    )

    const repository = new LucidAttachmentRepository()
    assert.equal((await repository.findById(replacement.attachmentId))?.path, 'users/42/second.jpg')
    assert.isNull(await AttachmentLinkModel.find(first.id))
    assert.isNull(await AttachmentModel.find(first.attachmentId))
    assert.deepEqual(removed, [first.attachmentId])

    await lifecycle.detach(owner)

    assert.isNull(await AttachmentLinkModel.find(replacement.id))
    assert.isNull(await AttachmentModel.find(replacement.attachmentId))
    assert.isNull(await AttachmentModel.find('variant-id'))
    assert.sameDeepMembers(removed, [first.attachmentId, replacement.attachmentId, 'variant-id'])
  })
})
