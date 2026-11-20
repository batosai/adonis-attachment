import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { createFfprobeMetadataExtractor } from '../src/media/binaries.js'
import { AttachmentManager, AttachmentService, LocalFileStorage, VariantGenerationService, defineSourceConverter } from '../index.js'

test.group('Source converters', () => {
  test('keeps staged imports through rollback and removes them after saving or discarding', async ({ assert }) => {
    const location = await mkdtemp(join(tmpdir(), 'attachment-staged-test-'))
    const storage = new LocalFileStorage({ location })
    const manager = new AttachmentManager(new AttachmentService({
      storage, defaultDisk: 'fs', queue: { async enqueue() {} },
    }))
    const draft = await manager.createFromStream(Readable.from([Buffer.from('video payload')]))
    const path = draft.source.file!.path
    try {
      const checkpoint = draft.retainForRollback()
      await draft.persist()
      await access(path)
      checkpoint.rollback()
      const saved = await draft.persist()
      assert.equal(await readFile(join(location, saved.path), 'utf8'), 'video payload')
      await assert.rejects(() => access(path))

      const abandoned = await manager.createFromStream(Readable.from(['unused']))
      const abandonedPath = abandoned.source.file!.path
      await abandoned.discard()
      await assert.rejects(() => access(abandonedPath))
      await assert.rejects(() => abandoned.persist(), 'Attachment draft source is unavailable')
    } finally {
      await draft.discard()
      await rm(location, { recursive: true, force: true })
    }
  })

  test('rejects files that grow before or during persistence without leaving partial output', async ({ assert }) => {
    const location = await mkdtemp(join(tmpdir(), 'attachment-size-test-'))
    const original = join(location, 'input.mp4')
    const storage = new LocalFileStorage({ location })
    const write = storage.writeStream.bind(storage)
    try {
      const service = new AttachmentService({ storage, defaultDisk: 'fs', queue: { async enqueue() {} } })
      await writeFile(original, 'a')
      const draft = await new AttachmentManager(service, { maxBytes: 1 }).createFromPath(original)
      await writeFile(original, 'ab')
      await assert.rejects(() => draft.persist(), /source size changed/)
      await writeFile(original, 'a')
      storage.writeStream = async (input) => {
        await writeFile(original, 'ab')
        await write(input)
      }
      await assert.rejects(() => draft.persist(), /source size changed/)
      await assert.rejects(() => access(join(location, draft.path)))
    } finally {
      await rm(location, { recursive: true, force: true })
    }
  })

  test('stores a file output through streams and cleans up on success and failure', async ({ assert }) => {
    const location = await mkdtemp(join(tmpdir(), 'attachment-source-test-'))
    const storage = new LocalFileStorage({ location })
    const probed: string[] = []
    const attachments = new AttachmentService({
      storage, defaultDisk: 'fs', queue: { async enqueue() {} }, defaults: { meta: true },
      metadataExtractors: [createFfprobeMetadataExtractor({
        runner: { async run({ args }) {
          const path = args.at(-1)!
          await access(path)
          probed.push(path)
          return { stdout: Buffer.from('{}'), stderr: Buffer.alloc(0) }
        } },
      })],
    })
    const paths: string[] = []
    try {
      const original = join(location, 'original.mp4')
      await writeFile(original, 'video payload')
      const attachment = await (await new AttachmentManager(attachments).createFromPath(original)).persist()
      assert.deepEqual(probed, [original])
      storage.read = async () => { throw new Error('Unexpected buffered read') }
      let fail = false
      let blurhashCalls = 0
      const variants = new VariantGenerationService({
        attachments,
        blurhash: { async generate() { blurhashCalls++; return 'unexpected' } },
        converters: [defineSourceConverter({
          key: 'video',
          blurhash: true,
          async convertSource({ input, context }) {
            const [a, b] = await Promise.all([input.toFile(), input.toFile()])
            assert.equal(a, b)
            await assert.rejects(() => input.toBuffer({ maxBytes: 1 }))
            const output = await context.createTempFile({ extension: 'mp4' })
            paths.push(a, output)
            await pipeline(await input.toStream(), createWriteStream(output))
            if (fail) throw new Error('Conversion failed')
            return { data: { type: 'file', path: output }, fileName: 'video.mp4', mimeType: 'video/mp4' }
          },
        })],
      })
      const [variant] = await variants.generateAll({ attachment })
      assert.exists(variant)
      assert.equal(blurhashCalls, 0)
      assert.deepEqual(probed, [original, paths[1]])
      assert.equal(variant!.attachment.size, 13)
      assert.equal(await readFile(join(location, variant!.attachment.path), 'utf8'), 'video payload')
      for (const path of paths) await assert.rejects(() => access(path))
      await access(original)
      fail = true
      await assert.rejects(() => variants.generateAll({ attachment }), 'Conversion failed')
      for (const path of paths) await assert.rejects(() => access(path))
    } finally {
      await rm(location, { recursive: true, force: true })
    }
  })
})
