/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import https from 'node:https'
import { IncomingMessage } from 'node:http'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'

import { UserFactory } from './fixtures/factories/user.js'
import { attachmentManager } from '../index.js'

test.group('SVG file syntaxe ok', () => {
  test('with path and name params', async ({ assert }) => {
    const path = app.makePath('../fixtures/images/adonis.svg')

    const avatar = await attachmentManager.createFromPath(path, 'file.svg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'file.svg')
    assert.match(data.avatar.name, /(.*).svg$/)
    assert.equal(data.avatar.mimeType, 'image/svg+xml')
    assert.equal(data.avatar.extname, 'svg')
  })

  test('with path and no name params', async ({ assert }) => {
    const path = app.makePath('../fixtures/images/adonis.svg')

    const avatar = await attachmentManager.createFromPath(path)

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'adonis.svg')
    assert.match(data.avatar.name, /(.*).svg$/)
    assert.equal(data.avatar.mimeType, 'image/svg+xml')
    assert.equal(data.avatar.extname, 'svg')
  })

  test('with url and name params', async ({ assert }) => {
    const url = new URL(
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/adonis.svg'
    )

    const avatar = await attachmentManager.createFromUrl(url, 'file.svg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'file.svg')
    assert.match(data.avatar.name, /(.*).svg$/)
    assert.equal(data.avatar.mimeType, 'image/svg+xml')
    assert.equal(data.avatar.extname, 'svg')
  })

  test('with url and no name params', async ({ assert }) => {
    const url = new URL(
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/adonis.svg'
    )

    const avatar = await attachmentManager.createFromUrl(url)

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'adonis.svg')
    assert.match(data.avatar.name, /(.*).svg$/)
    assert.equal(data.avatar.mimeType, 'image/svg+xml')
    assert.equal(data.avatar.extname, 'svg')
  })

  test('with stream and name params', async ({ assert }) => {
    async function downloadImageStream(input: URL): Promise<IncomingMessage> {
      return await new Promise((resolve) => {
        https.get(input, (response) => {
          if (response.statusCode === 200) {
            resolve(response)
          }
        })
      })
    }

    const url = new URL(
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/adonis.svg'
    )
    const stream = await downloadImageStream(url)

    const avatar = await attachmentManager.createFromStream(stream, 'file.svg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'file.svg')
    assert.match(data.avatar.name, /(.*).svg$/)
    assert.equal(data.avatar.mimeType, 'image/svg+xml')
    assert.equal(data.avatar.extname, 'svg')
  })

  test('with stream and no name params', async ({ assert }) => {
    async function downloadImageStream(input: URL): Promise<IncomingMessage> {
      return await new Promise((resolve) => {
        https.get(input, (response) => {
          if (response.statusCode === 200) {
            resolve(response)
          }
        })
      })
    }

    const url = new URL(
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/adonis.svg'
    )
    const stream = await downloadImageStream(url)

    const avatar = await attachmentManager.createFromStream(stream)

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.match(data.avatar.originalName, /(.*).xml$/)
    assert.match(data.avatar.name, /(.*).xml$/)
    assert.equal(data.avatar.mimeType, 'application/xml')
    assert.equal(data.avatar.extname, 'xml')
  })
})

test.group('SVG file syntaxe nok', () => {
  test('with path and name params', async ({ assert }) => {
    const path = app.makePath('../fixtures/images/adonisjs.svg')

    const avatar = await attachmentManager.createFromPath(path, 'file.svg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'file.svg')
    assert.match(data.avatar.name, /(.*).svg$/)
    assert.equal(data.avatar.mimeType, 'image/svg+xml')
    assert.equal(data.avatar.extname, 'svg')
  })

  test('with path and no name params', async ({ assert }) => {
    const path = app.makePath('../fixtures/images/adonisjs.svg')

    const avatar = await attachmentManager.createFromPath(path)

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'adonisjs.svg')
    assert.match(data.avatar.name, /(.*).svg$/)
    assert.equal(data.avatar.mimeType, 'image/svg+xml')
    assert.equal(data.avatar.extname, 'svg')
  })

  test('with url and name params', async ({ assert }) => {
    const url = new URL(
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/adonisjs.svg'
    )

    const avatar = await attachmentManager.createFromUrl(url, 'file.svg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'file.svg')
    assert.match(data.avatar.name, /(.*).svg$/)
    assert.equal(data.avatar.mimeType, 'image/svg+xml')
    assert.equal(data.avatar.extname, 'svg')
  })

  test('with url and no name params', async ({ assert }) => {
    const url = new URL(
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/adonisjs.svg'
    )

    const avatar = await attachmentManager.createFromUrl(url)

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'adonisjs.svg')
    assert.match(data.avatar.name, /(.*).svg$/)
    assert.equal(data.avatar.mimeType, 'image/svg+xml')
    assert.equal(data.avatar.extname, 'svg')
  })

  test('with stream and name params', async ({ assert }) => {
    async function downloadImageStream(input: URL): Promise<IncomingMessage> {
      return await new Promise((resolve) => {
        https.get(input, (response) => {
          if (response.statusCode === 200) {
            resolve(response)
          }
        })
      })
    }

    const url = new URL(
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/adonisjs.svg'
    )
    const stream = await downloadImageStream(url)

    const avatar = await attachmentManager.createFromStream(stream, 'file.svg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'file.svg')
    assert.match(data.avatar.name, /(.*).svg$/)
    assert.equal(data.avatar.mimeType, 'image/svg+xml')
    assert.equal(data.avatar.extname, 'svg')
  })

  test('with stream and no name params', async ({ assert }) => {
    async function downloadImageStream(input: URL): Promise<IncomingMessage> {
      return await new Promise((resolve) => {
        https.get(input, (response) => {
          if (response.statusCode === 200) {
            resolve(response)
          }
        })
      })
    }

    const url = new URL(
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/adonisjs.svg'
    )
    const stream = await downloadImageStream(url)

    const avatar = await attachmentManager.createFromStream(stream)

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.match(data.avatar.originalName, /(.*).tmp$/)
    assert.match(data.avatar.name, /(.*).tmp$/)
    assert.equal(data.avatar.mimeType, 'application/x-temp')
    assert.equal(data.avatar.extname, 'tmp')
  })
})
