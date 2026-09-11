import { setApp } from '@adonisjs/core/services/app'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import { defineConfig, type ResolvedAttachmentConfig } from '../src/define_config.js'
import { AttachmentService } from '../src/core/attachment_service.js'
import type { AttachmentJob } from '../src/core/queue.js'
import { MemoryAttachmentQueue } from '../src/queues/memory_queue.js'
import { attachment, AttachmentRelation, createLucidAttachmentProcessor, LucidJsonVariantGenerationService } from '../src/integrations/lucid/index.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'
import { AttachmentCommitError } from '../src/integrations/lucid/persistence/attachment_transaction.js'

class JsonJobUser extends BaseModel {
  static table = 'json_job_users'
  static selfAssignPrimaryKey = true
  @column({ isPrimary: true }) declare id: string
  @column() declare name: string
  @attachment({ persistence: 'json', columnName: 'image', variants: ['thumbnail'], meta: true }) declare avatar: AttachmentRelation<'json'>
  @attachment() declare tableOnly: AttachmentRelation
}

test.group('Lucid JSON attachment workers', (group) => {
  let db: Awaited<ReturnType<typeof createLucidTestDatabase>>
  let service: AttachmentService
  let resolved: ResolvedAttachmentConfig
  let loads = 0
  let converted = 0
  let duringConversion: (() => Promise<void>) | undefined
  let duringExtraction: (() => Promise<void>) | undefined
  const jobs: AttachmentJob[] = []
  const files = new Map<string, Uint8Array>()
  const app = {
    container: {
      hasBinding: (name: string) => name === 'lucid.db',
      async make(name: string) {
        if (name === 'jrmc.attachment') return service
        if (name === 'jrmc.attachment.json') return resolved.jsonPersistence
        if (name === 'jrmc.attachment.repository') return resolved.repository
        if (name === 'jrmc.attachment.converters') return resolved.converters
        throw new Error(`Unexpected binding ${name}`)
      },
    },
  }
  async function configure(memory = false) {
    resolved = await defineConfig({
      defaultDisk: 'fs', defaults: { rename: false }, route: false,
      integrations: { lucid: { jsonModels: { json_job_users: async () => { loads++; return { default: JsonJobUser } } } } },
      media: { metadata: [{ async extract() { await duringExtraction?.(); return { inspected: true } } }], metadataPolicy: { mode: 'deferred' } },
      converters: { thumbnail: { converter: async () => ({ default: {
        key: 'thumbnail',
        async convert() {
          converted++
          await duringConversion?.()
          return { body: new Uint8Array([converted]), fileName: 'thumb.jpg', mimeType: 'image/jpeg' }
        },
      } }) } },
      ...(!memory ? { queue: { async enqueue(job: AttachmentJob) { jobs.push(job) } } } : {}),
      storage: {
        async write(value) { files.set(value.path, value.body) },
        async read(value) { const body = files.get(value.path); if (!body) throw new Error('Missing file'); return body },
        async remove(value) { files.delete(value.path) },
      },
    }).resolver(app as never)
    service = new AttachmentService(resolved)
    setApp(app as never)
  }
  async function create() {
    const row = new JsonJobUser(); row.id = '42'; row.name = 'Alice'
    row.avatar.set(service.createDraft({ body: new Uint8Array([1]), originalName: 'avatar.jpg' }))
    await row.save(); return row
  }
  const processor = () => createLucidAttachmentProcessor(app as never)
  const variantJob = () => jobs.find((job) => job.type === 'generate-variants')!
  group.setup(async () => {
    db = await createLucidTestDatabase({ createSchema: false })
    JsonJobUser.useAdapter(db.modelAdapter())
    await db.connection().schema.createTable('json_job_users', (table) => { table.string('id').primary(); table.string('name'); table.text('image') })
  })
  group.each.setup(async () => {
    await db.from('json_job_users').delete(); files.clear(); jobs.length = 0; loads = 0; converted = 0; duringConversion = undefined; duringExtraction = undefined
    await configure()
  })
  group.teardown(async () => { await db.manager.closeAll() })

  test('resolves serialized jobs through trusted lazy imports with no attachment tables', async ({ assert }) => {
    const row = await create()
    assert.equal(loads, 0)
    const stale = await JsonJobUser.findOrFail('42')
    const worker = processor()
    await worker.process(JSON.parse(JSON.stringify(variantJob())))
    assert.isAbove(loads, 0)
    const variants = await row.avatar.variants()
    assert.lengthOf(variants, 1)
    assert.equal(variants[0]!.toAttachment().reference?.adapter, 'json')
    assert.notEqual(variants[0]!.toAttachment().path, 'thumb.jpg')
    for (const job of jobs.filter((job) => job.type === 'extract-metadata')) await worker.process(JSON.parse(JSON.stringify(job)))
    stale.name = 'Bob'; await stale.save()
    assert.deepEqual((await stale.avatar.get())!.toAttachment().metadata, { inspected: true })
    assert.deepEqual((await stale.avatar.variants())[0]!.toAttachment().metadata, { inspected: true })
    assert.isFalse(await db.connection().schema.hasTable('adonis_attachments'))
  })

  test('automatically processes JSON variants and metadata on the default memory queue', async ({ assert }) => {
    await configure(true)
    const row = await create()
    await (resolved.queue as MemoryAttachmentQueue).drain()
    assert.lengthOf(await row.avatar.variants(), 1)
    assert.deepEqual((await row.avatar.get())!.toAttachment().metadata, { inspected: true })
    assert.deepEqual((await row.avatar.variants())[0]!.toAttachment().metadata, { inspected: true })
  })

  test('does not overwrite a user metadata edit committed while extraction is running', async ({ assert }) => {
    const row = await create()
    const snapshot = (await row.avatar.get())!.toAttachment()
    duringExtraction = async () => {
      const store = await resolved.jsonPersistence!.storeFor(snapshot.reference!)
      await store.patchMetadata(snapshot, snapshot.metadata, { caption: 'edited during extraction' })
    }
    await processor().process(jobs.find((job) => job.type === 'extract-metadata')!)
    assert.deepEqual((await row.avatar.get())!.toAttachment().metadata, { caption: 'edited during extraction', inspected: true })
  })

  test('rejects unknown owners and non-JSON fields without converting or falling back to SQL table IDs', async ({ assert }) => {
    await create()
    const job = variantJob()
    const reference = job.reference!
    for (const owner of [ { ...reference.owner!, type: 'other' }, { ...reference.owner!, field: 'tableOnly' }, { ...reference.owner!, field: 'missing' } ]) {
      await assert.rejects(() => processor().process({ ...job, reference: { ...reference, owner } }), /not registered|authorized model field/)
    }
    assert.equal(converted, 0)
    assert.equal(files.size, 1)
  })

  test('rejects stale original and variant metadata jobs after replacement', async ({ assert }) => {
    const row = await create()
    const worker = processor()
    await worker.process(variantJob())
    const oldVariant = (await row.avatar.variants())[0]!
    await row.avatar.regenerateVariants(['thumbnail'])
    await worker.process(jobs.filter((job) => job.type === 'generate-variants').at(-1)!)
    assert.isFalse(files.has(oldVariant.toAttachment().path))
    const staleMetadata = jobs.find((job) => job.type === 'extract-metadata' && job.attachmentId === oldVariant.id)!
    await assert.rejects(() => worker.process(staleMetadata), /not found/)
    row.avatar.set(service.createDraft({ body: new Uint8Array([2]), originalName: 'new.jpg' }, { variants: [] }))
    await row.save()
    await assert.rejects(() => worker.process(variantJob()), /not found/)
    assert.isEmpty(await row.avatar.variants())
  })

  test('cleans unowned generated files when the original is replaced during conversion', async ({ assert }) => {
    const row = await create()
    duringConversion = async () => {
      row.avatar.set(service.createDraft({ body: new Uint8Array([2]), originalName: 'new.jpg' }, { variants: [], meta: false }))
      await row.save()
    }
    await assert.rejects(() => processor().process(variantJob()), /not found/)
    assert.sameMembers([...files.keys()], ['new.jpg'])
    assert.isEmpty(await row.avatar.variants())
  })

  test('rolls back the whole generated batch on duplicate variant keys and keeps previous files', async ({ assert }) => {
    const row = await create()
    const original = (await row.avatar.get())!.toAttachment()
    const generated = await Promise.all(['one.jpg', 'two.jpg'].map((originalName) => service.create({ body: new Uint8Array([2]), originalName })))
    const worker = new LucidJsonVariantGenerationService({ attachments: service, registry: resolved.jsonPersistence!, generator: {
      async generateAll() { return generated.map((attachment) => ({ key: 'duplicate', attachment })) },
    } })
    await assert.rejects(() => worker.generate({ attachment: original }), /already exists/)
    assert.isEmpty(await row.avatar.variants())
    assert.sameMembers([...files.keys()], ['avatar.jpg'])
  })

  test('retains generated files when commit outcome is unknown', async ({ assert }) => {
    const row = await create()
    const original = (await row.avatar.get())!
    const generated = await service.create({ body: new Uint8Array([2]), originalName: 'uncertain.jpg' })
    let rollbackRegistered = false
    const scoped = {
      async listOwnerLinks() { return [original] },
      afterRollback() { rollbackRegistered = true },
      afterCommit() {},
      async createVariant() { return { toAttachment() { return generated } } },
    }
    const store = {
      ...scoped,
      async transaction(_owner: unknown, callback: (value: typeof scoped) => Promise<void>) {
        await callback(scoped)
        throw new AttachmentCommitError(new Error('Connection lost during commit'))
      },
    }
    const worker = new LucidJsonVariantGenerationService({ attachments: service, registry: {
      async storeFor() { return store },
    } as never, generator: { async generateAll() { return [{ key: 'thumbnail', attachment: generated }] } } })
    await assert.rejects(() => worker.generate({ attachment: original.toAttachment() }), /commit outcome is unknown/)
    assert.isTrue(rollbackRegistered)
    assert.isTrue(files.has(generated.path))
    assert.isTrue(files.has(original.toAttachment().path))
  })

  test('does not delete the published replacement when post-commit old-file cleanup fails', async ({ assert }) => {
    const row = await create()
    const worker = processor()
    await worker.process(variantJob())
    const oldVariant = (await row.avatar.variants())[0]!
    const remove = service.remove.bind(service)
    service.remove = async (file) => {
      if (file.path === oldVariant.toAttachment().path) throw new Error('Storage unavailable')
      return remove(file)
    }
    await row.avatar.regenerateVariants(['thumbnail'])
    await assert.rejects(() => worker.process(jobs.filter((job) => job.type === 'generate-variants').at(-1)!), /post-commit work failed/)
    const replacement = (await row.avatar.variants())[0]!
    assert.notEqual(replacement.id, oldVariant.id)
    assert.isTrue(files.has(replacement.toAttachment().path))
    assert.isTrue(files.has(oldVariant.toAttachment().path))
  })
})
