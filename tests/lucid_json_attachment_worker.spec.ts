import { setApp } from '@adonisjs/core/services/app'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { test } from '@japa/runner'
import { defineConfig, type ResolvedAttachmentConfig } from '../src/define_config.js'
import { AttachmentService } from '../src/core/attachment_service.js'
import type { AttachmentJob } from '../src/core/queue.js'
import { MemoryAttachmentQueue } from '../src/queues/memory_queue.js'
import { attachment as tableAttachment, AttachmentRelation, AttachmentRegenerator, createLucidAttachmentProcessor } from '../src/integrations/lucid/index.js'
import { attachment, Attachment } from '../src/integrations/legacy/index.js'
import { LucidJsonVariantGenerationService } from '../src/integrations/legacy/json/lucid_json_variant_generation_service.js'
import type { LucidJsonAttachmentRegistry } from '../src/integrations/legacy/json/lucid_json_attachment_registry.js'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'
import { AttachmentCommitError } from '../src/integrations/lucid/persistence/attachment_transaction.js'

class JsonJobUser extends BaseModel {
  static table = 'json_job_users'
  static selfAssignPrimaryKey = true
  @column({ isPrimary: true }) declare id: string
  @column() declare name: string
  @attachment({ columnName: 'image', variants: ['thumbnail'], meta: true }) declare avatar: Attachment | null
  @tableAttachment() declare tableOnly: AttachmentRelation
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
      hasBinding: (name: string) => name === 'lucid.db' || name === 'jrmc.attachment.processingAdapters',
      async make(name: string) {
        if (name === 'jrmc.attachment') return service
        if (name === 'jrmc.attachment.processingAdapters') return resolved.processingAdapters
        if (name === 'jrmc.attachment.repository') return resolved.repository
        if (name === 'jrmc.attachment.converters') return resolved.converters
        throw new Error(`Unexpected binding ${name}`)
      },
    },
  }
  async function configure(memory = false) {
    resolved = await defineConfig({
      defaultDisk: 'fs', defaults: { rename: false }, route: false,
      integrations: { legacy: { models: { json_job_users: async () => { loads++; return { default: JsonJobUser } } } } },
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
    row.avatar = new Attachment(service.createDraft({ body: new Uint8Array([1]), originalName: 'avatar.jpg' }), service)
    await row.save(); return row
  }
  const registry = () => resolved.processingAdapters!.json!.repository as LucidJsonAttachmentRegistry
  const store = (row: JsonJobUser) => registry().storeFor({ version: 1, adapter: 'json', id: 'lookup',
    owner: { type: 'json_job_users', id: row.id, field: 'avatar' } })
  const loadOriginal = async (row: JsonJobUser) => (await store(row)).findOriginal({ type: 'json_job_users', id: row.id, field: 'avatar' })
  const loadVariants = async (row: JsonJobUser) => (await store(row)).listVariants((await loadOriginal(row))!.id)
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
    const variants = await loadVariants(row)
    assert.lengthOf(variants, 1)
    assert.equal(variants[0]!.toAttachment().reference?.adapter, 'json')
    assert.notEqual(variants[0]!.toAttachment().path, 'thumb.jpg')
    for (const job of jobs.filter((job) => job.type === 'extract-metadata')) await worker.process(JSON.parse(JSON.stringify(job)))
    stale.name = 'Bob'; await stale.save()
    assert.deepEqual((await loadOriginal(stale))!.toAttachment().metadata, { inspected: true })
    assert.deepEqual((await loadVariants(stale))[0]!.toAttachment().metadata, { inspected: true })
    assert.isFalse(await db.connection().schema.hasTable('adonis_attachments'))
  })

  test('automatically processes JSON variants and metadata on the default memory queue', async ({ assert }) => {
    await configure(true)
    const row = await create()
    await (resolved.queue as MemoryAttachmentQueue).drain()
    assert.lengthOf(await loadVariants(row), 1)
    assert.deepEqual((await loadOriginal(row))!.toAttachment().metadata, { inspected: true })
    assert.deepEqual((await loadVariants(row))[0]!.toAttachment().metadata, { inspected: true })
  })

  test('does not overwrite a user metadata edit committed while extraction is running', async ({ assert }) => {
    const row = await create()
    const snapshot = (await loadOriginal(row))!.toAttachment()
    duringExtraction = async () => {
      const store = await registry().storeFor(snapshot.reference!)
      await store.patchMetadata(snapshot, snapshot.metadata, { caption: 'edited during extraction' })
    }
    await processor().process(jobs.find((job) => job.type === 'extract-metadata')!)
    assert.deepEqual((await loadOriginal(row))!.toAttachment().metadata, { caption: 'edited during extraction', inspected: true })
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
    const oldVariant = (await loadVariants(row))[0]!
    await new AttachmentRegenerator().row(row, { attributes: ['avatar'], variants: ['thumbnail'] }).run()
    await worker.process(jobs.filter((job) => job.type === 'generate-variants').at(-1)!)
    assert.isFalse(files.has(oldVariant.toAttachment().path))
    const staleMetadata = jobs.find((job) => job.type === 'extract-metadata' && job.attachmentId === oldVariant.id)!
    await assert.rejects(() => worker.process(staleMetadata), /not found/)
    row.avatar = new Attachment(service.createDraft({ body: new Uint8Array([2]), originalName: 'new.jpg' }, { variants: [] }), service)
    await row.save()
    await assert.rejects(() => worker.process(variantJob()), /not found/)
    assert.isEmpty(await loadVariants(row))
  })

  test('cleans unowned generated files when the original is replaced during conversion', async ({ assert }) => {
    const row = await create()
    duringConversion = async () => {
      row.avatar = new Attachment(service.createDraft({ body: new Uint8Array([2]), originalName: 'new.jpg' }, { variants: [], meta: false }), service)
      await row.save()
    }
    await assert.rejects(() => processor().process(variantJob()), /not found/)
    assert.sameMembers([...files.keys()], ['new.jpg'])
    assert.isEmpty(await loadVariants(row))
  })

  test('rolls back the whole generated batch on duplicate variant keys and keeps previous files', async ({ assert }) => {
    const row = await create()
    const original = (await loadOriginal(row))!.toAttachment()
    const generated = await Promise.all(['one.jpg', 'two.jpg'].map((originalName) => service.create({ body: new Uint8Array([2]), originalName })))
    const worker = new LucidJsonVariantGenerationService({ attachments: service, registry: registry(), generator: {
      async generateAll() { return generated.map((attachment) => ({ key: 'duplicate', attachment })) },
    } })
    await assert.rejects(() => worker.generate({ attachment: original }), /already exists/)
    assert.isEmpty(await loadVariants(row))
    assert.sameMembers([...files.keys()], ['avatar.jpg'])
  })

  test('retains generated files when commit outcome is unknown', async ({ assert }) => {
    const row = await create()
    const original = (await loadOriginal(row))!
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
    const oldVariant = (await loadVariants(row))[0]!
    const remove = service.remove.bind(service)
    service.remove = async (file) => {
      if (file.path === oldVariant.toAttachment().path) throw new Error('Storage unavailable')
      return remove(file)
    }
    await new AttachmentRegenerator().row(row, { attributes: ['avatar'], variants: ['thumbnail'] }).run()
    await assert.rejects(() => worker.process(jobs.filter((job) => job.type === 'generate-variants').at(-1)!), /post-commit work failed/)
    const replacement = (await loadVariants(row))[0]!
    assert.notEqual(replacement.id, oldVariant.id)
    assert.isTrue(files.has(replacement.toAttachment().path))
    assert.isTrue(files.has(oldVariant.toAttachment().path))
  })
})
