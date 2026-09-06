/**
 * @jrmc/adonis-attachment
 *
 * @license MIT
 * @copyright Jeremy Chaufourier <jeremy@chaufourier.fr>
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { test } from '@japa/runner'

import MakeAttachmentV5Migration from '../commands/make/attachment_v5_migration.js'
import { stubsRoot } from '../stubs/main.js'
import { createLegacyAttachmentMigrationStubState } from '../src/integrations/lucid/index.js'

test.group('legacy attachment migration stub', () => {
  test('prepares a timestamped destination and template state', ({ assert }) => {
    assert.deepEqual(
      createLegacyAttachmentMigrationStubState({
        directory: '/app/database/scripts',
        defaultDisk: 's3',
        timestamp: 1700000000000,
      }),
      {
        destination: '/app/database/scripts/1700000000000_migrate_v5_attachments.ts',
        defaultDisk: 's3',
      }
    )
  })

  test('uses a package stub for the generated data migration', async ({ assert }) => {
    const stub = await readFile(join(stubsRoot, 'migrations/legacy_attachment_migration.stub'), 'utf8')

    assert.include(stub, 'exports({ to: destination })')
    assert.include(stub, "defaultDisk: '{{ defaultDisk }}'")
    assert.include(stub, 'migrateLegacyAttachmentRecords')
    assert.include(stub, 'AttachmentLinkModel.createMany(rows.links')
    assert.include(stub, 'export default async function migrateAttachments()')
    assert.notInclude(stub, 'void main()')
  })

  test('uses the package stub from the Ace command', async ({ assert }) => {
    const generated: Array<{ root: string; path: string; state: Record<string, unknown> }> = []
    const messages: string[] = []

    await MakeAttachmentV5Migration.prototype.run.call({
      parsed: { flags: { disk: 's3', folder: 'database/scripts' } },
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

    assert.equal(generated[0]?.root, stubsRoot)
    assert.equal(generated[0]?.path, 'migrations/legacy_attachment_migration.stub')
    assert.equal(generated[0]?.state.defaultDisk, 's3')
    assert.match(String(generated[0]?.state.destination), /^\/app\/database\/scripts\/\d+_migrate_v5_attachments\.ts$/)
    assert.match(messages[0] ?? '', /^Created \/app\/database\/scripts\//)
  })
})
