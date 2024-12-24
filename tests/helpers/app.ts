/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { Router } from '@adonisjs/core/http'
import { IgnitorFactory } from '@adonisjs/core/factories'
import { EncryptionFactory } from '@adonisjs/core/factories/encryption'
import { QsParserFactory } from '@adonisjs/core/factories/http'
import { defineConfig as defineLucidConfig } from '@adonisjs/lucid'
import { copyFile, mkdir } from 'node:fs/promises'
import { defineConfig } from '../../src/define_config.js'
import { defineConfig as defineDriveConfig, services } from '@adonisjs/drive'
import { ApplicationService } from '@adonisjs/core/types'

const APP_ROOT = new URL('../tmp/', import.meta.url)

const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

export async function createApp() {
  await mkdir(APP_ROOT.pathname, { recursive: true })

  const testApp = new IgnitorFactory()
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
              location: APP_ROOT,
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
                filename: new URL('./db.sqlite', APP_ROOT).pathname,
              },
            },
          },
        }),
      },
    })
    .withCoreConfig()
    .withCoreProviders()
    .create(APP_ROOT, {
      importer: IMPORTER,
    })
    // .tap((app) => {
    //   app.booting(async () => {})
    //   app.starting(async () => {})
    //   app.listen('SIGTERM', () => app.terminate())
    //   app.listenIf(app.managedByPm2, 'SIGINT', () => app.terminate())
    // })
    .createApp('web')

  await testApp.init()
  await testApp.boot()

  testApp.container.bind('router', () => createRouter(testApp))

  await mkdir(testApp.migrationsPath(), { recursive: true })

  await copyFile(
    new URL('./fixtures/migrations/create_users_table.ts', import.meta.url),
    testApp.migrationsPath('create_users_table.ts')
  )

  return testApp
}

export function createRouter(app: ApplicationService) {
  const encryption = new EncryptionFactory().create()
  const qs = new QsParserFactory().create()

  const router = new Router(app, encryption, qs)

  router.get(`/avatars/*`, () => {}).as('drive.fs.serve')
  router.commit()

  return router
}

export async function initializeDatabase(app: ApplicationService) {
  const ace = await app.container.make('ace')
  await ace.exec('migration:fresh', [])
  await seedDatabase()
}

async function seedDatabase() {
  const { default: User } = await import('./fixtures/models/user.js')
  await User.createMany([{ name: 'AdonisJS' }, { name: 'Jeremy' }])
}
