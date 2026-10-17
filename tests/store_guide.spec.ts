import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { test } from '@japa/runner'
import {
  AttachmentService,
  ConfiguredVariantConverterRegistry,
  type AttachmentJob,
} from '../index.js'

const root = fileURLToPath(new URL('../../', import.meta.url))

async function guideSources() {
  const contents = await readFile(join(root, 'docs/guide/creating-a-store.md'), 'utf8')
  return new Map(
    [...contents.matchAll(/```ts \[([^\]]+)\]\n([\s\S]*?)\n```/g)].map(
      (match) => [resolve(root, match[1]!), match[2]!] as const,
    ),
  )
}

test.group('Creating a store guide', () => {
  test('typechecks all complete example modules against the public package exports', async ({
    assert,
  }) => {
    const sources = await guideSources()
    assert.isAtLeast(sources.size, 6)
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      exactOptionalPropertyTypes: true,
      skipLibCheck: true,
      noEmit: true,
      types: ['node'],
    }
    const host = ts.createCompilerHost(options)
    const originalRead = host.readFile.bind(host)
    const originalExists = host.fileExists.bind(host)
    const originalDirectoryExists = host.directoryExists?.bind(host)
    host.readFile = (file) => sources.get(file) ?? originalRead(file)
    host.fileExists = (file) => sources.has(file) || originalExists(file)
    host.directoryExists = (directory) =>
      [...sources.keys()].some((file) => file.startsWith(directory + sep)) ||
      originalDirectoryExists?.(directory) === true
    host.getSourceFile = (file, languageVersion) => {
      const source = host.readFile(file)
      return source === undefined
        ? undefined
        : ts.createSourceFile(file, source, languageVersion, true)
    }
    const program = ts.createProgram([...sources.keys()], options, host)
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map(
        (diagnostic) =>
          `${diagnostic.file?.fileName ?? ''}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
      )
    assert.deepEqual(diagnostics, [])
  }).timeout(60_000)

  test('runs the documented class, publishes metadata after records, and cleans rejected variants', async ({
    assert,
    cleanup,
  }) => {
    const directory = await mkdtemp(join(tmpdir(), 'attachment-store-guide-'))
    cleanup(() => rm(directory, { recursive: true, force: true }))
    await writeFile(join(directory, 'package.json'), '{"type":"module"}')
    const sources = await guideSources()
    for (const name of ['example_attachment_store', 'processing_example_store']) {
      const source = sources.get(join(root, `app/attachments/${name}.ts`))!
      const output = ts
        .transpileModule(source, {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
          },
        })
        .outputText.replaceAll(
          "'@jrmc/adonis-attachment'",
          JSON.stringify(pathToFileURL(join(root, 'build/index.js')).href),
        )
      const destination = join(directory, `${name}.js`)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, output)
    }
    const { default: Store } = await import(
      pathToFileURL(join(directory, 'processing_example_store.js')).href
    )
    const app = {}
    const store = await Store.fromApp(app, { defaultDisk: 'fs' })
    assert.strictEqual(await Store.fromApp(app, { defaultDisk: 'fs' }), store)
    assert.notStrictEqual(await Store.fromApp({}, { defaultDisk: 'fs' }), store)
    const files = new Map<string, Uint8Array>()
    const removed: string[] = []
    const jobs: AttachmentJob[] = []
    let nextId = 0
    const service = new AttachmentService({
      defaultDisk: 'fs',
      createId: () => `guide-${++nextId}`,
      storage: {
        async write(input) {
          files.set(input.path, input.body)
        },
        async read(input) {
          return files.get(input.path)!
        },
        async remove(input) {
          files.delete(input.path)
          removed.push(input.path)
        },
      },
      metadataMode: 'deferred',
      metadataExtractors: [
        {
          async extract() {
            return { inspected: true }
          },
        },
      ],
      metadataPersister: store.metadataPersister,
      queue: {
        async enqueue(job) {
          assert.isNotNull(
            await store.repository.findById(job.attachmentId),
            'metadata queued before publication',
          )
          jobs.push(job)
        },
      },
    })
    const original = await service
      .createDraft({ body: new Uint8Array([1]), originalName: 'image.png' })
      .persist()
    await store.insertOriginal(original)
    await service.extractAndPersistMetadata(original)
    assert.deepEqual((await store.repository.findById(original.id)).metadata, { inspected: true })
    const converters = new ConfiguredVariantConverterRegistry({
      thumbnail: {
        converter: async () => ({
          default: {
            key: 'thumbnail',
            async convert() {
              return { body: new Uint8Array([2]), fileName: 'thumbnail.png', mimeType: 'image/png' }
            },
          },
        }),
      },
    })
    const generator = store.variants(service, converters, {
      defaultDisk: 'fs',
      variant: { basePath: 'previews' },
    })
    await generator.generate({ attachment: original, variantKeys: ['thumbnail'], meta: true })
    const variant = await store.repository.findById('guide-2')
    assert.isNotNull(variant)
    assert.include(variant.path, 'previews/')
    assert.deepEqual(
      jobs.map((job) => job.attachmentId),
      [variant.id],
    )
    await assert.rejects(
      () => generator.generate({ attachment: original, variantKeys: ['thumbnail'], meta: false }),
      /Variant already exists/,
    )
    assert.isNull(await store.repository.findById('guide-3'))
    assert.lengthOf(removed, 1)
    assert.isTrue(files.has(original.path))
    assert.isTrue(files.has(variant.path))
    await assert.rejects(
      () => generator.generate({ attachment: original, mode: 'replace' }),
      /does not support regeneration/,
    )
    assert.equal(nextId, 3)
  })
})
