import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import sharp from 'sharp'
import { test } from '@japa/runner'
import type { ResolvedAttachmentConfig } from '../index.js'

const root = fileURLToPath(new URL('../../', import.meta.url))

async function importExample(source: string) {
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText.replaceAll("'@jrmc/adonis-attachment'", JSON.stringify(new URL('../index.js', import.meta.url).href))
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

test.group('Documentation examples', () => {
  test('typechecks complete variant and event examples against public exports', async ({ assert }) => {
    const sources = new Map<string, string>()
    for (const guide of ['variants', 'events']) {
      const contents = await readFile(resolve(root, `docs/guide/${guide}.md`), 'utf8')
      for (const match of contents.matchAll(/```ts \[([^\]]+)\]\n([\s\S]*?)\n```/g)) {
        sources.set(resolve(root, '.documentation_examples', match[1]!), match[2]!)
      }
    }
    assert.isAtLeast(sources.size, 5)
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true,
      exactOptionalPropertyTypes: true, skipLibCheck: true, noEmit: true, types: ['node'],
    }
    const host = ts.createCompilerHost(options)
    const read = host.readFile.bind(host)
    const exists = host.fileExists.bind(host)
    const directoryExists = host.directoryExists?.bind(host)
    host.readFile = (file) => sources.get(file) ?? read(file)
    host.fileExists = (file) => sources.has(file) || exists(file)
    host.directoryExists = (directory) => [...sources.keys()].some((file) => file.startsWith(directory + sep)) || directoryExists?.(directory) === true
    host.getSourceFile = (file, languageVersion) => {
      const source = host.readFile(file)
      return source === undefined ? undefined : ts.createSourceFile(file, source, languageVersion, true)
    }
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([...sources.keys()], options, host))
    assert.deepEqual(diagnostics.map((item) => `${item.file?.fileName}: ${ts.flattenDiagnosticMessageText(item.messageText, '\n')}`), [])
  }).timeout(60_000)

  test('the first Lucid thumbnail example selects a persistence store', async ({ assert }) => {
    const guide = await readFile(resolve(root, 'docs/guide/variants.md'), 'utf8')
    const source = /```ts \[config\/attachment.ts\]\n([\s\S]*?)\n```/.exec(guide)![1]!
    const { default: config } = await importExample(source)
    const resolved: ResolvedAttachmentConfig = await config.resolver({ makePath: (path: string) => resolve(root, path) })
    assert.exists(resolved.store?.repository)
    assert.isFunction(resolved.store?.variants)
  })

  test('the generated thumbnail recipe really resizes the image', async ({ assert }) => {
    const stub = await readFile(resolve(root, 'stubs/config/attachment.stub'), 'utf8')
    const source = stub.slice(stub.indexOf('import ')).replace(
      /  \/\/ converters: \{\n[\s\S]*?\n  \/\/ \},/,
      (block) => block.replace(/^  \/\/ /gm, '  '),
    )
    const { default: config } = await importExample(source)
    const resolved: ResolvedAttachmentConfig = await config.resolver({ makePath: (path: string) => resolve(root, path) })
    const converter = await resolved.converters!.get('thumbnail')
    const body = await sharp({ create: { width: 640, height: 480, channels: 3, background: 'red' } }).png().toBuffer()
    const output = await converter!.convert({ body, attachment: {
      id: 'image', disk: 'fs', path: 'image.png', name: 'image.png', originalName: 'image.png',
      extname: 'png', mimeType: 'image/png', size: body.length,
    } })
    const metadata = await sharp(output!.body).metadata()
    assert.equal(metadata.width, 320)
    assert.equal(metadata.format, 'webp')
  })
})
