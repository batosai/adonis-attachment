/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import type { ApplicationService } from '@adonisjs/core/types'
import type { InferConverters } from '../../src/types/config.js'

import { copyFile, mkdir, rm } from 'node:fs/promises'
import { IgnitorFactory } from '@adonisjs/core/factories'
import { defineConfig as defineLucidConfig } from '@adonisjs/lucid'
import { defineConfig } from '../../src/define_config.js'
import { defineConfig as defineDriveConfig, services } from '@adonisjs/drive'

import { BASE_URL } from './index.js'

const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, BASE_URL).href)
  }
  return import(filePath)
}

const attachmentConfig = defineConfig({
  converters: {
    thumbnail: {
      converter: () => import('../fixtures/converters/image_converter.js'),
      options: {
        resize: 300,
        blurhash: true
      },
    },
    medium: {
      converter: () => import('../fixtures/converters/image_converter.js'),
      options: {
        resize: 600,
        blurhash: {
          enabled: true,
          componentX: 4,
          componentY: 4
        }
      },
    },
  },
})

declare module '@jrmc/adonis-attachment' {
  interface AttachmentVariants extends InferConverters<typeof attachmentConfig> {}
}

export async function createApp(options?: Object) {
  const app = new IgnitorFactory()
    .merge({
      rcFileContents: {
        commands: [() => import('@adonisjs/lucid/commands')],
        providers: [
          () => import('@adonisjs/lucid/database_provider'),
          () => import('@adonisjs/drive/drive_provider'),
          () => import('../../providers/attachment_provider.js'),
        ],
      },
      config: {
        attachment: options
          ? defineConfig({
              ...options,
              converters: {
                thumbnail: {
                  converter: () => import('../fixtures/converters/image_converter.js'),
                  options: {
                    resize: 300,
                  },
                },
              },
            })
          : attachmentConfig,
        drive: defineDriveConfig({
          default: 'fs',
          services: {
            fs: services.fs({
              location: BASE_URL,
              serveFiles: true,
              routeBasePath: '/uploads',
              visibility: 'public',
            }),
          },
        }),
        database: defineLucidConfig({
          connection: 'sqlite',
          connections: {
            sqlite: {
              client: 'better-sqlite3',
              connection: {
                filename: decodeURIComponent(new URL('../db.sqlite', BASE_URL).pathname),
              },
            },
          },
        }),
      },
    })
    .withCoreConfig()
    .withCoreProviders()
    .create(BASE_URL, {
      importer: IMPORTER,
    })
    .createApp('web')

  await app.init()
  await app.boot()

  await mkdir(app.migrationsPath(), { recursive: true })

  await copyFile(
    new URL('../fixtures/migrations/create_users_table.ts', import.meta.url),
    app.migrationsPath('create_users_table.ts')
  )

  return app
}

export async function initializeDatabase(app: ApplicationService) {
  const ace = await app.container.make('ace')
  await ace.exec('migration:fresh', [])
  // await seedDatabase()
}

export async function removeDatabase() {
  await rm(decodeURIComponent(new URL('../db.sqlite', BASE_URL).pathname))
}

// async function seedDatabase() {
//   const { default: User } = await import('./fixtures/models/user.js')
//   await User.createMany([{ name: 'AdonisJS' }, { name: 'Jeremy' }])
// }
