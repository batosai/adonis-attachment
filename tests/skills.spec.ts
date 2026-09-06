import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ts from 'typescript'
import { test } from '@japa/runner'

const root = fileURLToPath(new URL('../../', import.meta.url))
const skillsRoot = resolve(root, 'skills')

async function markdownFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await markdownFiles(path))
    else if (entry.name.endsWith('.md')) files.push(path)
  }
  return files
}

test.group('consumer skills', () => {
  test('includes every skill and reference in the npm package', async ({ assert }) => {
    const { stdout } = await promisify(execFile)('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
      cwd: root, maxBuffer: 10 * 1024 * 1024,
    })
    const [archive] = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>
    const paths = new Set(archive!.files.map((file) => file.path))
    for (const file of await markdownFiles(skillsRoot)) {
      assert.isTrue(paths.has(relative(root, file).split(sep).join('/')), `${file} missing from package`)
    }
  }).timeout(30_000)

  test('keeps references inside each independently installable skill', async ({ assert }) => {
    for (const name of await readdir(skillsRoot)) {
      const directory = resolve(skillsRoot, name)
      const entry = await readFile(resolve(directory, 'SKILL.md'), 'utf8')
      assert.match(entry, /^---\nname: [a-z0-9-]+\ndescription: .+\n/)
      for (const file of await markdownFiles(directory)) {
        const contents = await readFile(file, 'utf8')
        for (const match of contents.matchAll(/\]\(([^)]+)\)/g)) {
          const link = match[1]!
          if (/^(https?:|#)/.test(link)) continue
          const target = resolve(dirname(file), link.split('#')[0]!)
          assert.isFalse(relative(directory, target).startsWith(`..${sep}`), `${file}: ${link}`)
          assert.isTrue((await stat(target)).isFile(), `${file}: ${link}`)
        }
      }
    }
  })

  test('typechecks the embedded application examples against public package exports', async ({ assert }) => {
    const sources = new Map<string, string>()
    const origins = new Map<string, string>()
    for (const file of await markdownFiles(skillsRoot)) {
      const contents = await readFile(file, 'utf8')
      for (const match of contents.matchAll(/```ts\n([\s\S]*?)\n```/g)) {
        const path = resolve(root, `.skill_example_${sources.size}.ts`)
        sources.set(path, match[1]!)
        origins.set(path, relative(skillsRoot, file))
      }
    }
    assert.isAtLeast(sources.size, 7)
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      exactOptionalPropertyTypes: true,
      experimentalDecorators: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      types: ['node'],
    }
    const host = ts.createCompilerHost(options)
    const originalGetSourceFile = host.getSourceFile.bind(host)
    const originalFileExists = host.fileExists.bind(host)
    host.fileExists = (file) => sources.has(file) || originalFileExists(file)
    host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => {
      const source = sources.get(file)
      return source === undefined
        ? originalGetSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile)
        : ts.createSourceFile(file, source, languageVersion, true)
    }
    const program = ts.createProgram([...sources.keys()], options, host)
    const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
      const file = diagnostic.file?.fileName ?? ''
      return `${origins.get(file) ?? file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
    })
    assert.deepEqual(diagnostics, [])
  }).timeout(60_000)
})
