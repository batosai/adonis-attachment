import { test } from '@japa/runner'
import { decodeJsonAttachments, documentFromAttachment } from '../src/integrations/legacy/json/json_attachment_document.js'

const owner = { type: 'users', id: '42', field: 'gallery' }
const legacy = { name: 'photo.jpg', size: 1, extname: 'jpg', mimeType: 'image/jpeg' }

test('JSON legacy identities survive reordering and remain scoped to their owner', ({ assert }) => {
  const second = { ...legacy, name: 'second.jpg' }
  const firstRead = decodeJsonAttachments([legacy, second], 'many', owner, 'fs')
  const reordered = decodeJsonAttachments([second, legacy], 'many', owner, 'fs')
  assert.equal(firstRead[0]!.id, reordered[1]!.id)
  assert.notEqual(firstRead[0]!.id, decodeJsonAttachments([legacy], 'many', { ...owner, id: '43' }, 'fs')[0]!.id)
  assert.notProperty(legacy, 'id')
})

test('JSON codec rejects malformed fields, duplicate identities, aliases and variant keys', ({ assert }) => {
  for (const value of [
    { ...legacy, size: -1 }, { ...legacy, size: Number.MAX_SAFE_INTEGER + 1 },
    { ...legacy, size: '42' }, { ...legacy, meta: [] }, { ...legacy, id: '' },
    { ...legacy, variants: {} },
    { ...legacy, variants: [{ ...legacy, name: 'v.jpg', key: 'thumb', variants: [] }] },
    { ...legacy, variants: [{ ...legacy, name: 'a.jpg', key: 'thumb' }, { ...legacy, name: 'b.jpg', key: 'thumb' }] },
  ]) assert.throws(() => decodeJsonAttachments(value, 'one', owner, 'fs'))
  assert.throws(() => decodeJsonAttachments([legacy, legacy], 'many', owner, 'fs'), /distinct IDs/)
  assert.throws(() => decodeJsonAttachments([{ ...legacy, id: 'same' }, { ...legacy, id: 'same', name: 'other.jpg' }], 'many', owner, 'fs'), /distinct IDs/)
  assert.throws(() => decodeJsonAttachments(legacy, 'many', owner, 'fs'), /JSON array/)
  assert.throws(() => decodeJsonAttachments([legacy], 'one', owner, 'fs'), /JSON object/)
})

test('JSON codec writes v5 metadata names without runtime URLs or locator fields', ({ assert }) => {
  const document = documentFromAttachment({ ...legacy, id: 'file', disk: 'fs', path: 'photo.jpg', originalName: 'original.jpg', metadata: { caption: 'été' }, url: '/runtime' })
  assert.deepEqual(document.meta, { caption: 'été' })
  assert.notProperty(document, 'metadata')
  assert.notProperty(document, 'url')
  assert.notProperty(document, 'reference')
  assert.deepEqual(decodeJsonAttachments(null, 'one', owner, 'fs'), [])
  assert.deepEqual(decodeJsonAttachments('null', 'many', owner, 'fs'), [])
})
