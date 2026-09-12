import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'Adonis Attachment',
    description:
      'File attachments for AdonisJS 7: storage, image variants, and optional Lucid persistence, without the coupling.',
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
