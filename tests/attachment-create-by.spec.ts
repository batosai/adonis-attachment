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
import drive from '@adonisjs/drive/services/main'
import app from '@adonisjs/core/services/app'
import { MultipartFileFactory } from '@adonisjs/core/factories/bodyparser'

import { UserFactory } from './fixtures/factories/user.js'
import { attachmentManager } from '../index.js'

test.group('attachment create', () => {
  test('with base64 (prefix)', async ({ assert }) => {
    const avatar = await attachmentManager.createFromBase64(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVEiJtZZPbBtFFMZ/M7ubXdtdb1xSFyeilBapySVU8h8OoFaooFSqiihIVIpQBKci6KEg9Q6H9kovIHoCIVQJJCKE1ENFjnAgcaSGC6rEnxBwA04Tx43t2FnvDAfjkNibxgHxnWb2e/u992bee7tCa00YFsffekFY+nUzFtjW0LrvjRXrCDIAaPLlW0nHL0SsZtVoaF98mLrx3pdhOqLtYPHChahZcYYO7KvPFxvRl5XPp1sN3adWiD1ZAqD6XYK1b/dvE5IWryTt2udLFedwc1+9kLp+vbbpoDh+6TklxBeAi9TL0taeWpdmZzQDry0AcO+jQ12RyohqqoYoo8RDwJrU+qXkjWtfi8Xxt58BdQuwQs9qC/afLwCw8tnQbqYAPsgxE1S6F3EAIXux2oQFKm0ihMsOF71dHYx+f3NND68ghCu1YIoePPQN1pGRABkJ6Bus96CutRZMydTl+TvuiRW1m3n0eDl0vRPcEysqdXn+jsQPsrHMquGeXEaY4Yk4wxWcY5V/9scqOMOVUFthatyTy8QyqwZ+kDURKoMWxNKr2EeqVKcTNOajqKoBgOE28U4tdQl5p5bwCw7BWquaZSzAPlwjlithJtp3pTImSqQRrb2Z8PHGigD4RZuNX6JYj6wj7O4TFLbCO/Mn/m8R+h6rYSUb3ekokRY6f/YukArN979jcW+V/S8g0eT/N3VN3kTqWbQ428m9/8k0P/1aIhF36PccEl6EhOcAUCrXKZXXWS3XKd2vc/TRBG9O5ELC17MmWubD2nKhUKZa26Ba2+D3P+4/MNCFwg59oWVeYhkzgN/JDR8deKBoD7Y+ljEjGZ0sosXVTvbc6RHirr2reNy1OXd6pJsQ+gqjk8VWFYmHrwBzW/n+uMPFiRwHB2I7ih8ciHFxIkd/3Omk5tCDV1t+2nNu5sxxpDFNx+huNhVT3/zMDz8usXC3ddaHBj1GHj/As08fwTS7Kt1HBTmyN29vdwAw+/wbwLVOJ3uAD1wi/dUH7Qei66PfyuRj4Ik9is+hglfbkbfR3cnZm7chlUWLdwmprtCohX4HUtlOcQjLYCu+fzGJH2QRKvP3UNz8bWk1qMxjGTOMThZ3kvgLI5AzFfo379UAAAAASUVORK5CYII=',
      'avatar.png'
    )

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'png',
      keyId: data.avatar.keyId,
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
      keyId: data.avatar.keyId,
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
      keyId: data.avatar.keyId,
      meta: {
        dimension: {
          height: 1313,
          width: 1920,
        },
      },
      mimeType: 'image/jpeg',
      name: data.avatar.name,
      originalName: 'avatar.jpg',
      size: 122_851,
    })
  })

  test('with file', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

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
      keyId: data.avatar.keyId,
      meta: {
        dimension: {
          height: 1313,
          width: 1920,
        },
      },
      mimeType: 'image/jpeg',
      name: data.avatar.name,
      originalName: 'file.jpg',
      size: 4_000_000,
    })
    fakeDisk.assertExists(user.avatar?.path!)
  })

  test('with path and name params', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const path = app.makePath('../fixtures/images/img.jpg')

    const avatar = await attachmentManager.createFromPath(path, 'file.jpg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'jpg',
      keyId: data.avatar.keyId,
      meta: {
        dimension: {
          height: 1313,
          width: 1920,
        },
      },
      mimeType: 'image/jpeg',
      name: data.avatar.name,
      originalName: 'file.jpg',
      size: 122_851,
    })
    fakeDisk.assertExists(user.avatar?.path!)
  })

  test('with path and no name params', async ({ assert }) => {
    const path = app.makePath('../fixtures/images/img.jpg')

    const avatar = await attachmentManager.createFromPath(path)

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'img.jpg')
    assert.match(data.avatar.name, /(.*).jpg$/)
    assert.equal(data.avatar.mimeType, 'image/jpeg')
    assert.equal(data.avatar.extname, 'jpg')
  })

  test('with url and name params', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const url = new URL(
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/img.jpg'
    )

    const avatar = await attachmentManager.createFromUrl(url, 'file.jpg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'jpg',
      keyId: data.avatar.keyId,
      meta: {
        dimension: {
          height: 1313,
          width: 1920,
        },
      },
      mimeType: 'image/jpeg',
      name: data.avatar.name,
      originalName: 'file.jpg',
      size: 122_851,
    })
    fakeDisk.assertExists(user.avatar?.path!)
  })

  test('with url and no name params', async ({ assert }) => {
    const url = new URL(
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/img.jpg'
    )

    const avatar = await attachmentManager.createFromUrl(url)

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.equal(data.avatar.originalName, 'img.jpg')
    assert.match(data.avatar.name, /(.*).jpg$/)
    assert.equal(data.avatar.mimeType, 'image/jpeg')
    assert.equal(data.avatar.extname, 'jpg')
  })

  test('with stream and name params', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

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
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/img.jpg'
    )
    const stream = await downloadImageStream(url)

    const avatar = await attachmentManager.createFromStream(stream, 'file.jpg')

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.deepEqual(data.avatar, {
      extname: 'jpg',
      keyId: data.avatar.keyId,
      meta: {
        dimension: {
          height: 1313,
          width: 1920,
        },
      },
      mimeType: 'image/jpeg',
      name: data.avatar.name,
      originalName: 'file.jpg',
      size: 122_851,
    })
    assert.match(data.avatar.name, /(.*).jpg$/)
    fakeDisk.assertExists(user.avatar?.path!)
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
      'https://raw.githubusercontent.com/batosai/adonis-attachment/refs/heads/develop/tests/fixtures/images/img.jpg'
    )
    const stream = await downloadImageStream(url)

    const avatar = await attachmentManager.createFromStream(stream)

    const user = await UserFactory.merge({ avatar }).create()
    const data = await user.serialize()

    assert.match(data.avatar.originalName, /(.*).jpg$/)
    assert.match(data.avatar.name, /(.*).jpg$/)
    assert.equal(data.avatar.mimeType, 'image/jpeg')
    assert.equal(data.avatar.extname, 'jpg')
  })
})

test.group('attachments create', () => {
  test('with buffers', async ({ assert }) => {
    const buffer = await readFile(app.makePath('../fixtures/images/img.jpg'))
    const file = await attachmentManager.createFromBuffer(buffer, 'avatar.jpg')
    const file2 = await attachmentManager.createFromBuffer(buffer, 'avatar2.jpg')

    const user = await UserFactory.merge({ weekendPics: [file, file2] }).create()
    const data = await user.serialize()

    assert.deepEqual(data.weekendPics, [
      {
        extname: 'jpg',
        keyId: data.weekendPics[0].keyId,
        meta: {
          dimension: {
            height: 1313,
            width: 1920,
          },
        },
        mimeType: 'image/jpeg',
        name: data.weekendPics[0].name,
        originalName: 'avatar.jpg',
        size: 122851,
      },
      {
        extname: 'jpg',
        keyId: data.weekendPics[1].keyId,
        meta: {
          dimension: {
            height: 1313,
            width: 1920,
          },
        },
        mimeType: 'image/jpeg',
        name: data.weekendPics[1].name,
        originalName: 'avatar2.jpg',
        size: 122851,
      },
    ])
  })

  test('with files', async ({ assert, cleanup }) => {
    const fakeDisk = drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const file = new MultipartFileFactory()
      .merge({
        size: 4_000_000,
        extname: 'jpg',
        type: 'image',
        subtype: 'jpeg',
      })
      .create()

    const file2 = new MultipartFileFactory()
      .merge({
        size: 3_000_000,
        extname: 'png',
        type: 'image',
        subtype: 'png',
      })
      .create()

    file.tmpPath = app.makePath('../fixtures/images/img.jpg')
    file2.tmpPath = app.makePath('../fixtures/images/img.jpg')

    const weekendPics = await attachmentManager.createFromFiles([file, file2])

    const user = await UserFactory.merge({ weekendPics }).create()
    const data = await user.serialize()

    assert.containsSubset(data.weekendPics[0], {
      name: data.weekendPics[0].name,
      mimeType: 'image/jpeg',
      originalName: 'file.jpg',
    })
    assert.containsSubset(data.weekendPics[1], {
      name: data.weekendPics[1].name,
      mimeType: 'image/png',
      originalName: 'file.png',
    })
    fakeDisk.assertExists(user.weekendPics![0]?.path!)
    fakeDisk.assertExists(user.weekendPics![1]?.path!)
  })
})

test.group('multiple Attachment(s) attributes', () => {
  test('with buffers', async ({ assert, cleanup }) => {
    drive.fake('fs')
    drive.fake('s3')
    cleanup(() => {
      drive.restore('fs')
      drive.restore('s3')
    })

    const buffer = await readFile(app.makePath('../fixtures/images/img.jpg'))
    const avatar = await attachmentManager.createFromBuffer(buffer, 'avatar.jpg')
    const avatar2 = await attachmentManager.createFromBuffer(buffer, 'avatar2.jpg')
    const file = await attachmentManager.createFromBuffer(buffer, 'avatar-file.jpg')
    const file2 = await attachmentManager.createFromBuffer(buffer, 'avatar-file2.jpg')

    const user = await UserFactory.merge({ avatar, avatar2, weekendPics: [file, file2] }).create()
    const data = await user.serialize()

    assert.containsSubset(data.avatar, {
      name: data.avatar.name,
      originalName: 'avatar.jpg',
    })

    assert.containsSubset(data.avatar2, {
      name: data.avatar2.name,
      originalName: 'avatar2.jpg',
    })

    assert.containsSubset(data.weekendPics[0], {
      name: data.weekendPics[0].name,
      originalName: 'avatar-file.jpg',
    })

    assert.containsSubset(data.weekendPics[1], {
      name: data.weekendPics[1].name,
      originalName: 'avatar-file2.jpg',
    })
  })

  test('update one Attachment in Attachments', async ({ assert, cleanup }) => {
    drive.fake('fs')
    cleanup(() => drive.restore('fs'))

    const buffer = await readFile(app.makePath('../fixtures/images/img.jpg'))

    const user = await UserFactory.create()

    const originalName0 = user.weekendPics![0].originalName

    user.weekendPics![1] = await attachmentManager.createFromBuffer(buffer, 'new-avatar.jpg')
    await user.save()

    const data = await user.serialize()

    assert.containsSubset(data.weekendPics[0], {
      originalName: originalName0,
    })

    assert.containsSubset(data.weekendPics[1], {
      originalName: 'new-avatar.jpg',
    })
  })
})
