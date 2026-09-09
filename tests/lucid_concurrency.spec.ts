import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { test } from '@japa/runner'
import { createLucidTestDatabase } from './helpers/lucid_test_database.js'
import { LucidAttachmentStore } from '../src/integrations/lucid/persistence/lucid_attachment_store.js'

test('serializes collection writers on separate SQLite connections and JS runtimes', async ({ assert }) => {
  const directory = await mkdtemp(join(tmpdir(), 'attachment-concurrency-'))
  const filename = join(directory, 'database.sqlite')
  const database = await createLucidTestDatabase({ filename })
  const workers: Worker[] = []
  let ready = 0
  const owner = { type: 'users', id: '1', field: 'gallery' }
  try {
    const completions = [0, 1].map((writer) => new Promise<void>((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        (async () => {
          const { createLucidTestDatabase } = await import(workerData.helper);
          const { LucidAttachmentStore } = await import(workerData.store);
          const db = await createLucidTestDatabase({ filename: workerData.filename, createSchema: false });
          parentPort.postMessage('ready');
          await new Promise(resolve => parentPort.once('message', resolve));
          try {
            for (let i = 0; i < 8; i++) {
              const id = workerData.writer + '-' + i;
              await new LucidAttachmentStore().createCollectionItem(workerData.owner, {
                id, disk: 'fs', path: id, name: id, originalName: id,
                mimeType: 'text/plain', extname: 'txt', size: 1,
              });
            }
          } finally { await db.manager.closeAll(); }
          parentPort.postMessage('done');
        })().catch(error => { throw error; });
      `, { eval: true, workerData: {
        filename, writer, owner,
        helper: new URL('./helpers/lucid_test_database.js', import.meta.url).href,
        store: new URL('../src/integrations/lucid/persistence/lucid_attachment_store.js', import.meta.url).href,
      } })
      workers.push(worker)
      worker.on('error', reject)
      worker.on('message', (message) => {
        if (message === 'ready') {
          ready++
          if (ready === 2) workers.forEach((worker) => worker.postMessage('go'))
        } else if (message === 'done') resolve()
      })
      worker.on('exit', (code) => { if (code) reject(new Error(`Writer exited with code ${code}`)) })
    }))
    await Promise.all(completions)
    const items = await new LucidAttachmentStore().listCollection(owner)
    assert.lengthOf(items, 16)
    assert.deepEqual(items.map((item) => item.position), Array.from({ length: 16 }, (_, index) => index))
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()))
    await database.manager.closeAll()
    await rm(directory, { recursive: true, force: true })
  }
}).timeout(15_000)
