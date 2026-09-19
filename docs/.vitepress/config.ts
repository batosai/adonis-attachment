import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { glob, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const docsRoot = fileURLToPath(new URL('..', import.meta.url))
const distRoot = resolve(docsRoot, '.vitepress/dist')
const siteUrl = 'https://next.adonis-attachment.jrmc.dev'
const markdownMirrors: Record<string, string> = {
  'index.md':
    'Adonis Attachment provides attachment primitives for AdonisJS 7 and standalone TypeScript applications. It separates file creation, storage, persistence, and background processing, so each integration remains optional.',
}

function toAgentMarkdown(file: string, raw: string): string {
  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  const attributes = frontmatter?.[1] ?? ''
  const content = frontmatter ? raw.slice(frontmatter[0].length).trim() : raw.trim()
  const title = attributes.match(/^title:\s*(.+)$/m)?.[1]
  const description = attributes.match(/^description:\s*(.+)$/m)?.[1]

  return [
    title && `# ${title}`,
    description && `> ${description}`,
    markdownMirrors[file] ?? content,
    '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Writes a Markdown representation beside every generated public page. Caddy
 * serves these only to clients that explicitly request `text/markdown`.
 */
async function buildAgentMarkdown(): Promise<void> {
  const files = await getPublicMarkdownFiles()

  await Promise.all(
    files.map(async (file) => {
      const source = resolve(docsRoot, file)
      const output = resolve(distRoot, relative(docsRoot, source))
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output, toAgentMarkdown(file, await readFile(source, 'utf-8')), 'utf-8')
    }),
  )
}

async function getPublicMarkdownFiles(): Promise<string[]> {
  const files: string[] = []

  for await (const file of glob('**/*.md', {
    cwd: docsRoot,
    exclude: ['.vitepress/**'],
  })) {
    files.push(file)
  }

  return files
}

export default withMermaid(
  defineConfig({
    title: 'Adonis Attachment',
    description:
      'File attachments for AdonisJS 7: storage, image variants, and optional Lucid persistence, without the coupling.',
    cleanUrls: true,
    head: [
      [
        'script',
        {
          'defer': '',
          'src': 'https://umami.jrmc.dev/script.js',
          'data-website-id': 'bcdd9b7d-2429-4f68-96de-8250404e0f56',
        },
      ],
    ],
    sitemap: { hostname: siteUrl },
    buildEnd: buildAgentMarkdown,
    themeConfig: {
      nav: [
        { text: 'Guide', link: '/guide/introduction' },
        { text: 'Quickstart', link: '/guide/getting-started' },
        { text: 'Migrate from v5', link: '/migration/from-v5' },
      ],
      sidebar: {
        '/guide/': [
          {
            text: 'Get started',
            items: [
              { text: 'Introduction', link: '/guide/introduction' },
              { text: 'Installation', link: '/guide/installation' },
              { text: 'Quickstart', link: '/guide/getting-started' },
              { text: 'Core concepts', link: '/guide/concepts' },
              { text: 'Agent skills', link: '/guide/agent-skills' },
            ],
          },
          {
            text: 'Everyday usage',
            items: [
              { text: 'Configuration', link: '/guide/configuration' },
              { text: 'Creating attachments', link: '/guide/creating-attachments' },
              { text: 'Image variants', link: '/guide/variants' },
              { text: 'Serving files', link: '/guide/serving-files' },
              { text: 'Background processing', link: '/guide/queues' },
              { text: 'Events', link: '/guide/events' },
              { text: 'Errors', link: '/guide/errors' },
            ],
          },
          {
            text: 'Storing in a database',
            items: [
              { text: 'With Lucid', link: '/guide/lucid' },
              { text: 'Legacy JSON fields (experimental)', link: '/guide/legacy' },
              { text: 'Legacy JSON internals', link: '/guide/json-persistence' },
              { text: 'With another data store', link: '/guide/custom-persistence' },
            ],
          },
        ],
        '/migration/': [
          {
            text: 'Migration',
            items: [{ text: 'From v5', link: '/migration/from-v5' }],
          },
        ],
      },
      socialLinks: [
        { icon: 'github', link: 'https://github.com/batosai/adonis-attachment' },
      ],
      search: { provider: 'local' },
    },
  })
)
