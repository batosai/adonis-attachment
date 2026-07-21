/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { test } from '@japa/runner'

import MakeConverter from '../commands/make/converter.js'
import { stubsRoot } from '../stubs/main.js'

test.group('make:converter', () => {
  test('generates the package converter stub', async ({ assert }) => {
    const generated: Array<{ root: string; path: string; state: Record<string, unknown> }> = []

    await MakeConverter.prototype.run.call({
      name: 'thumbnail',
      async createCodemods() {
        return {
          async makeUsingStub(root: string, path: string, state: Record<string, unknown>) {
            generated.push({ root, path, state })
          },
        }
      },
    } as never)

    assert.deepEqual(generated, [{ root: stubsRoot, path: 'converters/converter.stub', state: { name: 'thumbnail' } }])
    const stub = await readFile(join(stubsRoot, 'converters/converter.stub'), 'utf8')
    assert.include(stub, "app.makePath('app/converters'")
    assert.include(stub, 'extends Converter')
    assert.include(stub, 'async handle')
  })
})
