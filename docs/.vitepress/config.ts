import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Adonis Attachment',
  description:
    'Transform any field in your Lucid model into an attachment data type, automatically generating various sizes and formats.',
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

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      {
        text: 'Versions',
        items: [
          { text: '4.x.x', link: '/guide/essentials/introduction' },
          { text: '3.x.x', link: '/v3/guide/essentials/introduction' },
          { text: '2.4.2', link: '/v2/guide/essentials/introduction' },
        ]

      },
      {
        text: 'Other docs',
        items: [
          { text: 'AdonisJS', link: 'https://adonisjs.com' },
          { text: 'Lucid', link: 'https://lucid.adonisjs.com' },
          { text: 'Flydrive', link: 'https://flydrive.dev' },
          { text: 'Sharp', link: 'https://sharp.pixelplumbing.com' },
          { text: 'Fluent ffmpeg', link: 'https://www.npmjs.com/package/fluent-ffmpeg' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [{
        text: 'Guide',
        items: [
          {
            text: 'Start here',
            link: '/guide/start-here',
          },
          {
            text: 'Essentials',
            items: [
              {
                text: 'Introduction',
                link: '/guide/essentials/introduction',
              },
              {
                text: 'Installation',
                link: '/guide/essentials/installation',
              },
              {
                text: 'Configuration',
                link: '/guide/essentials/configuration',
              },
            ],
          },
          {
            text: 'Basic Usage',
            items: [
              {
                text: 'Migration Setup',
                link: '/guide/basic_usage/migration-setup',
              },
              {
                text: 'Model Setup',
                link: '/guide/basic_usage/model-setup',
              },
              {
                text: 'Controller Setup',
                link: '/guide/basic_usage/controller-setup',
              },
              {
                text: 'View Setup',
                link: '/guide/basic_usage/view-setup',
              },
              {
                text: 'Attachment Object',
                link: '/guide/basic_usage/attachment-object',
              },
            ],
          },
          {
            text: 'Converter',
            items: [
              {
                text: 'Image',
                link: '/guide/converters/image',
              },
              {
                text: 'PDF thumbnail',
                link: '/guide/converters/pdf-thumbnail',
              },
              {
                text: 'Document thumbnail',
                link: '/guide/converters/document-thumbnail',
              },
              {
                text: 'Video thumbnail',
                link: '/guide/converters/video-thumbnail',
              },
            ],
          },
          {
            text: 'Advanced Usage',
            items: [
              {
                text: 'Regeneration of variants',
                link: '/guide/advanced_usage/regenerate-variant',
              },
              {
                text: 'Exceptions',
                link: '/guide/advanced_usage/exceptions',
              },
              {
                text: 'PrecompileUrl',
                link: '/guide/advanced_usage/pre-compile-on-demand',
              },
              {
                text: 'Custom converter',
                link: '/guide/advanced_usage/custom-converter',
              },
              {
                text: 'Queue',
                link: '/guide/advanced_usage/queue',
              },
            ],
          },
          {
            text: 'Use cases',
            items: [
              {
                text: 'Picture',
                link: '/guide/use-cases/picture',
              },
            ],
          },
        ],
      },
      {
        text: 'Structure data JSON',
        link: '/structure-data-json',
      },
      {
        text: 'ChangeLog',
        link: '/changelog',
      },
    ],
    '/v2/': [{
      text: 'Guide',
      items: [
        {
          text: 'Start here',
          link: '/v2/guide/start-here',
        },
        {
          text: 'Essentials',
          items: [
            {
              text: 'Introduction',
              link: '/v2/guide/essentials/introduction',
            },
            {
              text: 'Installation',
              link: '/v2/guide/essentials/installation',
            },
            {
              text: 'Configuration',
              link: '/v2/guide/essentials/configuration',
            },
          ],
        },
        {
          text: 'Basic Usage',
          items: [
            {
              text: 'Migration Setup',
              link: '/v2/guide/basic_usage/migration-setup',
            },
            {
              text: 'Model Setup',
              link: '/v2/guide/basic_usage/model-setup',
            },
            {
              text: 'Controller Setup',
              link: '/v2/guide/basic_usage/controller-setup',
            },
            {
              text: 'View Setup',
              link: '/v2/guide/basic_usage/view-setup',
            },
          ],
        },
        {
          text: 'Converter',
          items: [
            {
              text: 'Image',
              link: '/v2/guide/converters/image',
            },
            {
              text: 'PDF thumbnail',
              link: '/v2/guide/converters/pdf-thumbnail',
            },
            {
              text: 'Document thumbnail',
              link: '/v2/guide/converters/document-thumbnail',
            },
            {
              text: 'Video thumbnail',
              link: '/v2/guide/converters/video-thumbnail',
            },
          ],
        },
        {
          text: 'Advanced Usage',
          items: [
            {
              text: 'Exceptions',
              link: '/v2/guide/advanced_usage/exceptions',
            },
            {
              text: 'PrecompileUrl',
              link: '/v2/guide/advanced_usage/pre-compile-on-demand',
            },
            {
              text: 'Custom converter',
              link: '/v2/guide/advanced_usage/custom-converter',
            },
            {
              text: 'Queue',
              link: '/v2/guide/advanced_usage/queue',
            },
          ],
        },
        {
          text: 'Use cases',
          items: [
            {
              text: 'Picture',
              link: '/v2/guide/use-cases/picture',
            },
          ],
        },
      ],
    },
    {
      text: 'Structure data JSON',
      link: '/structure-data-json',
    },
    {
      text: 'ChangeLog',
      link: '/changelog',
    }],
  '/v3/': [{
    text: 'Guide',
    items: [
      {
        text: 'Start here',
        link: '/v3/guide/start-here',
      },
      {
        text: 'Essentials',
        items: [
          {
            text: 'Introduction',
            link: '/v3/guide/essentials/introduction',
          },
          {
            text: 'Installation',
            link: '/v3/guide/essentials/installation',
          },
          {
            text: 'Configuration',
            link: '/v3/guide/essentials/configuration',
          },
        ],
      },
      {
        text: 'Basic Usage',
        items: [
          {
            text: 'Migration Setup',
            link: '/v3/guide/basic_usage/migration-setup',
          },
          {
            text: 'Model Setup',
            link: '/v3/guide/basic_usage/model-setup',
          },
          {
            text: 'Controller Setup',
            link: '/v3/guide/basic_usage/controller-setup',
          },
          {
            text: 'View Setup',
            link: '/v3/guide/basic_usage/view-setup',
          },
        ],
      },
      {
        text: 'Converter',
        items: [
          {
            text: 'Image',
            link: '/v3/guide/converters/image',
          },
          {
            text: 'PDF thumbnail',
            link: '/v3/guide/converters/pdf-thumbnail',
          },
          {
            text: 'Document thumbnail',
            link: '/v3/guide/converters/document-thumbnail',
          },
          {
            text: 'Video thumbnail',
            link: '/v3/guide/converters/video-thumbnail',
          },
        ],
      },
      {
        text: 'Advanced Usage',
        items: [
          {
            text: 'Exceptions',
            link: '/v3/guide/advanced_usage/exceptions',
          },
          {
            text: 'PrecompileUrl',
            link: '/v3/guide/advanced_usage/pre-compile-on-demand',
          },
          {
            text: 'Custom converter',
            link: '/v3/guide/advanced_usage/custom-converter',
          },
          {
            text: 'Queue',
            link: '/v3/guide/advanced_usage/queue',
          },
        ],
      },
      {
        text: 'Use cases',
        items: [
          {
            text: 'Picture',
            link: '/v3/guide/use-cases/picture',
          },
        ],
      },
    ],
  },
  {
    text: 'Structure data JSON',
    link: '/structure-data-json',
  },
  {
    text: 'ChangeLog',
    link: '/changelog',
  }],
  },

    socialLinks: [
      { icon: 'x', link: 'https://x.com/chaufourier' },
      { icon: 'discord', link: 'https://discord.gg/89eMn2vB' },
      { icon: 'github', link: 'https://github.com/batosai/adonis-attachment' },
    ],

    search: {
      provider: 'local',
      options: {
        _render(src, env, md) {
          const html = md.render(src, env)
          if (env.frontmatter?.search === false) return ''
          if (env.relativePath.startsWith('v2/')) return ''
          if (env.relativePath.startsWith('v3/')) return ''
          return html
        }
      }
    },
  },

  sitemap: {
    hostname: 'https://adonis-attachment.jrmc.dev/'
  }
})
