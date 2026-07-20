import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { test } from '@japa/runner'

import MakeAttachmentsTable from '../commands/make/attachments_table.js'
import { stubsRoot } from '../stubs/main.js'
import { createAttachmentsTableStubState } from '../src/integrations/lucid/attachments_table_stub.js'

test.group('attachments table migration stub', () => {
  test('prepares a timestamped destination and template state', ({ assert }) => {
    const state = createAttachmentsTableStubState({
      directory: '/app/database/migrations',
      tableName: 'media_attachments',
      timestamp: 1700000000000,
    })

    assert.deepEqual(state, {
      destination: '/app/database/migrations/1700000000000_create_media_attachments_table.ts',
      tableName: 'media_attachments',
      className: 'MediaAttachments',
    })
  })

  test('rejects unsafe table names', ({ assert }) => {
    assert.throws(
      () => createAttachmentsTableStubState({ directory: '/app', tableName: 'attachments; drop table users' }),
      'Lucid attachment table names must be snake_case identifiers'
    )
  })

  test('contains the polymorphic attachment schema', async ({ assert }) => {
    const stub = await readFile(join(stubsRoot, 'migrations/attachments_table.stub'), 'utf8')

    assert.include(stub, 'exports({ to: destination })')
    assert.include(stub, 'Create{{ className }}Table')
    assert.include(stub, "protected tableName = '{{ tableName }}'")
    assert.include(stub, "table.string('attachable_type').notNullable()")
    assert.include(stub, "table.integer('position').unsigned().nullable()")
    assert.include(stub, "table.uuid('parent_id').nullable()")
    assert.include(stub, "table.unique(['parent_id', 'variant_key'])")
  })

  test('uses the package stub from the Ace command', async ({ assert }) => {
    const generated: Array<{ root: string; path: string; state: Record<string, unknown> }> = []
    const messages: string[] = []

    await MakeAttachmentsTable.prototype.run.call({
      parsed: { flags: { table: 'media_attachments', folder: 'database/migrations' } },
      app: { makePath: (path: string) => `/app/${path}` },
      async createCodemods() {
        return {
          async makeUsingStub(root: string, path: string, state: Record<string, unknown>) {
            generated.push({ root, path, state })
          },
        }
      },
      logger: {
        success(message: string) {
          messages.push(message)
        },
      },
    } as never)

    assert.lengthOf(generated, 1)
    const stub = generated[0]
    const message = messages[0]

    if (!stub || !message) {
      throw new Error('The command must generate one migration and report its path')
    }

    assert.equal(stub.root, stubsRoot)
    assert.equal(stub.path, 'migrations/attachments_table.stub')
    assert.equal(stub.state.tableName, 'media_attachments')
    assert.equal(stub.state.className, 'MediaAttachments')
    assert.match(String(stub.state.destination), /^\/app\/database\/migrations\/\d+_create_media_attachments_table\.ts$/)
    assert.match(message, /^Created \/app\/database\/migrations\//)
  })
})
