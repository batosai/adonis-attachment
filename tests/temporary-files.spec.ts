/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { test } from '@japa/runner'
import { Readable } from 'node:stream'
import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import sinon from 'sinon'
import { createApp } from './helpers/app.js'
import attachmentManager from '../services/main.js'
import VariantGeneratorService from '../src/services/variant/variant_generator_service.js'
import { bufferToTempFile, streamToTempFile } from '../src/utils/helpers.js'
import { withTemporaryFiles, createTemporaryDirectory } from '../src/utils/temporary_files.js'
import BlurhashAdapter from '../src/adapters/blurhash.js'

const fixture = new URL('./fixtures/images/img.jpg', import.meta.url)

test.group('temporary file ownership', () => {
  test('cleans stream imports after persistence and generates multiple variants from storage', async ({
    assert,
    cleanup,
  }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const blurhash = sinon.stub(BlurhashAdapter, 'encode').returns('mock')
    cleanup(() => blurhash.restore())
    const attachment = await attachmentManager.createFromStream(
      Readable.from(await readFile(fixture)),
      'image.jpg'
    )
    const temporary = attachment.input as string
    await access(temporary)
    await attachmentManager.write(attachment)
    cleanup(() => attachmentManager.remove(attachment))
    await assert.rejects(() => access(temporary))
    assert.isUndefined(attachment.input)
    const before = new Set(await readdir(os.tmpdir()))
    const variants = await new VariantGeneratorService().generate({
      attachments: [attachment],
      options: { variants: ['thumbnail', 'medium'] },
    })
    assert.lengthOf(variants, 2)
    for (const variant of variants) assert.isAbove((await variant.getBuffer()).length, 0)
    const added = (await readdir(os.tmpdir())).filter(
      (name) => name.startsWith('tempfile-') && !before.has(name)
    )
    assert.isEmpty(added)
  })

  test('cleans URL imports after persistence', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const bytes = await readFile(fixture)
    const get = sinon.stub(https, 'get').callsFake((_url: any, callback: any) => {
      const response = Object.assign(Readable.from(bytes), { statusCode: 200 })
      queueMicrotask(() => callback(response))
      return new EventEmitter() as any
    })
    cleanup(() => get.restore())
    const attachment = await attachmentManager.createFromUrl(
      new URL('https://example.test/image.jpg')
    )
    const temporary = attachment.input as string
    await attachmentManager.write(attachment)
    cleanup(() => attachmentManager.remove(attachment))
    await assert.rejects(() => access(temporary))
    assert.deepEqual(await attachment.getBuffer(), bytes)
  })

  test('cleans downloads when metadata extraction fails', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    let temporary = ''
    const create = sinon.stub(attachmentManager, 'createFromPath').callsFake(async (path) => {
      temporary = path
      throw new Error('metadata failed')
    })
    cleanup(() => create.restore())
    await assert.rejects(
      () => attachmentManager.createFromStream(Readable.from(Buffer.from('content'))),
      /metadata failed/
    )
    await assert.rejects(() => access(temporary))
  })

  test('cleans partial native converter outputs', async ({ assert }) => {
    let directory = ''
    await assert.rejects(
      () =>
        withTemporaryFiles(async () => {
          directory = await createTemporaryDirectory()
          await writeFile(`${directory}/partial.jpg`, 'partial')
          throw new Error('native converter failed')
        }),
      /native converter failed/
    )
    await assert.rejects(() => access(directory))
  })

  test('preserves caller-owned files even inside the temporary directory', async ({
    assert,
    cleanup,
  }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    await withTemporaryFiles(async () => {
      const source = await bufferToTempFile(await readFile(fixture))
      const attachment = await attachmentManager.createFromPath(source, 'image.jpg')
      await attachmentManager.write(attachment)
      cleanup(() => attachmentManager.remove(attachment))
      await access(source)
      assert.equal(attachment.input, source)
    })
  })

  test('cleans owned imports when persistence fails', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const attachment = await attachmentManager.createFromStream(
      Readable.from(await readFile(fixture)),
      'image.jpg'
    )
    const temporary = attachment.input as string
    sinon.stub(attachment, 'put').rejects(new Error('storage failed'))
    await assert.rejects(() => attachmentManager.write(attachment), /storage failed/)
    await assert.rejects(() => access(temporary))
  })

  test('cleans conversion inputs and intermediates after failure', async ({ assert, cleanup }) => {
    const app = await createApp()
    cleanup(() => app.terminate())
    const attachment = await attachmentManager.createFromStream(
      Readable.from(await readFile(fixture)),
      'image.jpg'
    )
    await attachmentManager.write(attachment)
    cleanup(() => attachmentManager.remove(attachment))
    let inputPath = ''
    let intermediate = ''
    await assert.rejects(
      () =>
        new VariantGeneratorService().generateVariant({
          key: 'failure',
          attachment,
          converter: {
            options: {},
            async handle({ input }: any) {
              inputPath = input
              intermediate = await bufferToTempFile(Buffer.from('intermediate'))
              throw new Error('conversion failed')
            },
          } as any,
        }),
      /conversion failed/
    )
    await assert.rejects(() => access(inputPath))
    await assert.rejects(() => access(intermediate))
  })

  test('cleans partial streams on failure', async ({ assert }) => {
    const before = new Set(await readdir(os.tmpdir()))
    const stream = Readable.from(
      (async function* () {
        yield Buffer.from('partial')
        throw new Error('stream failed')
      })()
    )
    await assert.rejects(() => streamToTempFile(stream), /stream failed/)
    assert.isEmpty(
      (await readdir(os.tmpdir())).filter(
        (name) => name.startsWith('tempfile-') && !before.has(name)
      )
    )
  })

  test('isolates concurrent conversion scopes', async ({ assert }) => {
    let otherPath = ''
    let release!: () => void
    let ready!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const started = new Promise<void>((resolve) => {
      ready = resolve
    })
    const pending = withTemporaryFiles(async () => {
      otherPath = await bufferToTempFile(Buffer.from('other'))
      ready()
      await barrier
      await access(otherPath)
    })
    await started
    let first = ''
    await withTemporaryFiles(async () => {
      first = await bufferToTempFile(Buffer.from('first'))
    })
    await assert.rejects(() => access(first))
    await access(otherPath)
    release()
    await pending
    await assert.rejects(() => access(otherPath))
  })
})
