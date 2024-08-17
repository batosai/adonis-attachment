import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Adonis Attachment",
  description: "Transform any field in your Lucid model into an attachment data type, automatically generating various sizes and formats.",
  head: [
    [
      'script',
      { defer: '', src: 'https://umami.jrmc.dev/script.js', 'data-website-id':'bcdd9b7d-2429-4f68-96de-8250404e0f56' }
    ],
  ],
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/introduction' },
      {
        text: 'Other docs',
        items: [
          { text: 'AdonisJS', link: 'https://adonisjs.com' },
          { text: 'Lucid', link: 'https://lucid.adonisjs.com' },
          { text: 'Flydrive', link: 'https://flydrive.dev' },
          { text: 'Sharp', link: 'https://sharp.pixelplumbing.com' },
          { text: 'Fluent ffmpeg', link: 'https://www.npmjs.com/package/fluent-ffmpeg' },
        ]
      }
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          {
            text: 'Essentials',
            items: [
              {
                text: 'Introduction',
                link: '/guide/introduction'
              },
              {
                text: 'Installation',
                link: '/guide/installation'
              },
              {
                text: 'Configuration',
                link: '/guide/configuration'
              }
            ]
          },
          {
            text: 'Basic Usage',
            items: [
              {
                text: 'Migration Setup',
                link: '/guide/migration-setup'
              },
              {
                text: 'Model Setup',
                link: '/guide/model-setup'
              },
              {
                text: 'Controller Setup',
                link: '/guide/controller-setup'
              },
              {
                text: 'View Setup',
                link: '/guide/view-setup'
              }
            ]
          },
          {
            text: 'Converter',
            items: [
              {
                text: 'Image',
                link: '/guide/converters/image'
              },
              {
                text: 'Video thumbnail',
                link: '/guide/converters/video-thumbnail'
              },
            ]
          },
          {
            text: 'Advanced Usage',
            items: [
              {
                text: 'Custom converter',
                link: '/guide/custom-converter'
              },
            ]
          }
        ]
      },
      {
        text: 'Structure data JSON',
        link: '/structure-data-json'
      },
      {
        text: 'ChangeLog',
        link: '/changelog'
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/batosai/adonis-attachment' }
    ],

    search: {
      provider: 'local'
    }
  }
})
