import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Adonis Attachment',
  description: 'Attachments for AdonisJS 7, with optional Lucid and queue integrations.',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Migration v5', link: '/migration/from-v5' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Custom Persistence', link: '/guide/custom-persistence' },
            { text: 'Routes', link: '/guide/routes' },
            { text: 'Variants', link: '/guide/variants' },
          ],
        },
        {
          text: 'Integrations',
          items: [
            { text: 'Lucid', link: '/guide/lucid' },
            { text: 'Queues', link: '/guide/queues' },
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
    socialLinks: [{ icon: 'github', link: 'https://github.com/batosai/adonis-attachment' }],
  },
})
