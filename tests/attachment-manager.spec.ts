/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import https from 'node:https'
import { IncomingMessage } from 'node:http'
import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { MultipartFileFactory } from '@adonisjs/core/factories/bodyparser'

import { UserFactory } from './fixtures/factories/user.js'
import { attachmentManager } from '../index.js'

test.group('attachment-manager', () => {
  test('save method - should result in noop when attachment is created from db response', async ({
    assert,
  }) => {
    const attachmentManager = await app.container.make('jrmc.attachment')

    const attachment = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo123.jpg',
        originalName: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    assert.equal(attachment?.originalName, 'foo.jpg')
  })

  test('Attachment - should be null when db response is null', async ({ assert }) => {
    const attachmentManager = await app.container.make('jrmc.attachment')

    const attachment = attachmentManager.createFromDbResponse(null)
    assert.isNull(attachment)
  })

  test('Attachment path default is uploads', async ({ assert }) => {
    const attachmentManager = await app.container.make('jrmc.attachment')

    const attachment = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    assert.equal(attachment?.path!, 'uploads/foo.jpg')
  })

  test('Attachment path - should be custom', async ({ assert }) => {
    const attachmentManager = await app.container.make('jrmc.attachment')

    const attachment = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    attachment?.setOptions({ folder: 'avatar' })

    assert.equal(attachment?.path!, 'avatar/foo.jpg')
  })

  test('Attachment get url', async ({ assert, cleanup }) => {
    drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const attachmentManager = await app.container.make('jrmc.attachment')
    const attachment = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    attachment?.setOptions({ folder: 'avatars' })

    const url = await attachment?.getUrl()
    const signedUrl = await attachment?.getSignedUrl()

    assert.match(url!, /\/drive\/fakes\/avatars\/foo\.jpg/)
    assert.match(signedUrl!, /\/drive\/fakes\/signed\/avatars\/foo\.jpg/)
  })

  test('Precompute file url', async ({ assert, cleanup }) => {
    drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const attachmentManager = await app.container.make('jrmc.attachment')
    const attachment = attachmentManager.createFromDbResponse(
      JSON.stringify({
        size: 1440,
        name: 'foo.jpg',
        extname: 'jpg',
        mimeType: 'image/jpg',
      })
    )

    attachment?.setOptions({ preComputeUrl: true, folder: 'avatars' })
    await attachmentManager.preComputeUrl(attachment!)

    assert.match(attachment?.url!, /\/drive\/fakes\/avatars\/foo\.jpg/)
  })

  test('with base64 (prefix)', async ({ assert }) => {
    const avatar = await attachmentManager.createFromBase64(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII=',
      'avatar.png'
    )

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'png',
      meta: {
        dimension: {
          height: 24,
          width: 24,
        },
        host: 'www.inkscape.org',
      },
      mimeType: 'image/png',
      name: data.avatar.name,
      originalName: 'avatar.png',
      size: 965,
    })
  })

  test('with base64 (no prefix)', async ({ assert }) => {
    const avatar = await attachmentManager.createFromBase64(
      'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII=',
      'avatar.png'
    )

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'png',
      meta: {
        dimension: {
          height: 24,
          width: 24,
        },
        host: 'www.inkscape.org',
      },
      mimeType: 'image/png',
      name: data.avatar.name,
      originalName: 'avatar.png',
      size: 965,
    })
  })

  test('with buffer', async ({ assert }) => {
    const buffer = await readFile(app.makePath('../fixtures/images/img.jpg'))
    const avatar = await attachmentManager.createFromBuffer(buffer, 'avatar.jpg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'jpg',
      meta: {
        dimension: {
          height: 1313,
          width: 1920,
        },
      },
      mimeType: 'image/jpeg',
      name: data.avatar.name,
      originalName: 'avatar.jpg',
      size: 122851,
    })
  })

  test('with file', async ({ assert }) => {
    const file = new MultipartFileFactory()
      .merge({
        size: 4000000,
        extname: 'jpg',
        type: 'image',
        subtype: 'jpeg',
      })
      .create()

    file.tmpPath = app.makePath('../fixtures/images/img.jpg')

    const avatar = await attachmentManager.createFromFile(file)

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'jpg',
      meta: {
        dimension: {
          height: 1313,
          width: 1920,
        },
      },
      mimeType: 'image/jpeg',
      name: data.avatar.name,
      originalName: 'file.jpg',
      size: 4000000,
    })
  })

  test('with path', async ({ assert }) => {
    const path = app.makePath('../fixtures/images/img.jpg')

    const avatar = await attachmentManager.createFromPath(path, 'file.jpg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'jpg',
      meta: {
        dimension: {
          height: 1313,
          width: 1920,
        },
      },
      mimeType: 'image/jpeg',
      name: data.avatar.name,
      originalName: 'file.jpg',
      size: 83,
    })
  })

  test('with url', async ({ assert }) => {
    const url = new URL('https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/img.jpg')

    const avatar = await attachmentManager.createFromUrl(url, 'file.jpg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'jpg',
      meta: {
        dimension: {
          height: 1313,
          width: 1920,
        },
      },
      mimeType: 'image/jpeg',
      name: data.avatar.name,
      originalName: 'file.jpg',
      size: 31,
    })
  })

  test('with stream', async ({ assert }) => {
    async function downloadImageStream(input: URL): Promise<IncomingMessage> {
      return await new Promise((resolve) => {
        https.get(input, (response) => {
          if (response.statusCode === 200) {
            resolve(response)
          }
        })
      })
    }

    const url = new URL('https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/img.jpg')
    const stream = await downloadImageStream(url)

    const avatar = await attachmentManager.createFromStream(stream, 'file.jpg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'jpg',
      meta: {
        dimension: {
          height: 1313,
          width: 1920,
        },
      },
      mimeType: 'image/jpeg',
      name: data.avatar.name,
      originalName: 'file.jpg',
      size: 31,
    })
  })
})
