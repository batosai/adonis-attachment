/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { IgnitorFactory } from '@adonisjs/core/factories'
import { defineConfig as defineLucidConfig } from '@adonisjs/lucid'
import { defineConfig as defileLoggerConfig } from '@adonisjs/core/logger'
import { defineConfig } from '../../src/define_config.js'
import { defineConfig as defineDriveConfig, services } from '@adonisjs/drive'

import { BASE_URL } from './index.js'

const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, BASE_URL).href)
  }
  return import(filePath)
}

export async function createApp(options = {}) {

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
        attachment: defineConfig({
          ...options,
          converters: {
            thumbnail: {
              converter: () => import('../../src/converters/image_converter.js'),
              options: {
                resize: 300,
              }
            }
          }
        }),
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
                filename: new URL('./db.sqlite', BASE_URL).pathname,
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

  return app
}

// export async function initializeDatabase(app: ApplicationService) {
//   const ace = await app.container.make('ace')
//   await ace.exec('migration:fresh', [])
//   await seedDatabase()
// }

// async function seedDatabase() {
//   const { default: User } = await import('./fixtures/models/user.js')
//   await User.createMany([{ name: 'AdonisJS' }, { name: 'Jeremy' }])
// }
