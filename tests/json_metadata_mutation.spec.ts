import { test } from '@japa/runner'
import { JsonMetadataMutation } from '../src/integrations/lucid/json/json_metadata_mutation.js'
import { AttachmentMetadataConflictError } from '../src/errors.js'

test.group('JSON metadata mutations', () => {
  test('merges independent top-level and nested edits without mutating snapshots', ({ assert }) => {
    const before = { caption: 'old', details: { author: 'Alice', language: 'fr' } }
    const after = { caption: 'new', details: { author: 'Bob', language: 'fr' } }
    const current = { ...before, width: 100, details: { ...before.details, language: 'en', reviewed: true } }
    const original = structuredClone(current)
    const result = new JsonMetadataMutation(before, after).apply(current)
    assert.deepEqual(result, { caption: 'new', width: 100, details: { author: 'Bob', language: 'en', reviewed: true } })
    assert.deepEqual(current, original)
    assert.equal(before.caption, 'old')
    assert.notProperty(after, 'width')
  })

  test('merges independent children when metadata or a nested object was initially absent', ({ assert }) => {
    assert.deepEqual(new JsonMetadataMutation(undefined, { details: { caption: 'new' } }).apply({ details: { width: 100 } }), {
      details: { caption: 'new', width: 100 },
    })
    assert.deepEqual(new JsonMetadataMutation({}, { details: { caption: 'new' } }).apply({ details: { width: 100 } }), {
      details: { caption: 'new', width: 100 },
    })
  })

  test('distinguishes deletions, nulls and missing keys, preserving concurrent additions', ({ assert }) => {
    const before = { caption: 'old', details: { author: 'Alice', note: 'remove' }, nullable: null }
    const after = { details: { author: null }, nullable: null }
    assert.deepEqual(new JsonMetadataMutation(before, after).apply({ ...before, width: 100 }), {
      details: { author: null }, nullable: null, width: 100,
    })
  })

  test('keeps no-ops and identical concurrent writes idempotent', ({ assert }) => {
    assert.deepEqual(new JsonMetadataMutation({ caption: 'old' }, { caption: 'old' }).apply({ width: 100 }), { width: 100 })
    assert.deepEqual(new JsonMetadataMutation({ caption: 'old' }, { caption: 'new' }).apply({ caption: 'new', width: 100 }), { caption: 'new', width: 100 })
    assert.deepEqual(new JsonMetadataMutation({ nullable: null }, {}).apply({}), {})
    assert.isUndefined(new JsonMetadataMutation(undefined, undefined).apply(undefined))
  })

  test('reports conflicts on the exact literal key path without exposing values', ({ assert }) => {
    try {
      new JsonMetadataMutation({ details: { caption: 'old' } }, { details: { caption: 'mine' } }).apply({ details: { caption: 'theirs-secret' } })
      assert.fail('Expected a metadata conflict')
    } catch (error) {
      assert.instanceOf(error, AttachmentMetadataConflictError)
      const conflict = error as AttachmentMetadataConflictError
      assert.deepEqual(conflict.path, ['details', 'caption'])
      assert.equal(conflict.code, 'E_ATTACHMENT_METADATA_CONFLICT')
      assert.equal(conflict.status, 409)
      assert.notInclude(conflict.message, 'theirs-secret')
    }
  })

  test('rejects conflicting parent deletions, type changes and whole-metadata removal', ({ assert }) => {
    for (const current of [{}, { details: null }, { details: ['replaced'] }]) {
      assert.throws(() => new JsonMetadataMutation({ details: { caption: 'old' } }, { details: { caption: 'new' } }).apply(current), /changed concurrently/)
    }
    assert.throws(() => new JsonMetadataMutation({ details: { caption: 'old' } }, {}).apply({ details: { caption: 'old', width: 100 } }), /changed concurrently/)
    assert.throws(() => new JsonMetadataMutation({ caption: 'old' }, undefined).apply({ caption: 'old', width: 100 }), /changed concurrently/)
    assert.isUndefined(new JsonMetadataMutation({ caption: 'old' }, undefined).apply({ caption: 'old' }))
    assert.deepEqual(new JsonMetadataMutation({ details: 'text' }, { details: { caption: 'new' } }).apply({ details: 'text' }), { details: { caption: 'new' } })
  })

  test('treats arrays as indivisible values, not index-based patches', ({ assert }) => {
    const before = { tags: ['a', 'b'] }
    const after = { tags: ['a', 'c'] }
    assert.deepEqual(new JsonMetadataMutation(before, after).apply({ ...before, width: 100 }), { ...after, width: 100 })
    assert.throws(() => new JsonMetadataMutation(before, after).apply({ tags: ['a', 'b', 'worker'] }), /changed concurrently/)
  })

  test('captures immutable JSON snapshots, including undefined deletion and Date serialization', ({ assert }) => {
    const before = { details: { caption: 'old' }, remove: true }
    const after = { details: { caption: 'new' }, remove: undefined, date: new Date('2026-09-11T12:00:00Z') } as never
    const mutation = new JsonMetadataMutation(before, after)
    before.details.caption = 'edited after capture'
    const result = mutation.apply({ details: { caption: 'old' }, remove: true })!
    assert.deepEqual(result, { details: { caption: 'new' }, date: '2026-09-11T12:00:00.000Z' })
    ;(result.details as { caption: string }).caption = 'mutated result'
    assert.equal((mutation.apply({ details: { caption: 'old' }, remove: true })!.details as { caption: string }).caption, 'new')
  })

  test('preserves special keys literally without modifying prototypes', ({ assert }) => {
    const before = JSON.parse('{"__proto__":{"polluted":"old"},"constructor":{"prototype":{"flag":0}},"a.b":{"x/y~":1}}')
    const after = JSON.parse('{"__proto__":{"polluted":"new"},"constructor":{"prototype":{"flag":1}},"a.b":{"x/y~":2}}')
    const result = new JsonMetadataMutation(before, after).apply({ ...before, width: 100 })!
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { ...after, width: 100 })
    assert.strictEqual(Object.getPrototypeOf(result), Object.prototype)
    assert.notProperty(Object.prototype, 'polluted')
    assert.notProperty(Object.prototype, 'flag')
    assert.notProperty(result, 'a')
  })

  test('rejects non-object metadata and encodings that cannot be written as JSON', ({ assert }) => {
    const circular: Record<string, unknown> = {}; circular.self = circular
    for (const value of [null, [], 'text', circular, { bigint: 1n }]) {
      assert.throws(() => new JsonMetadataMutation({}, value as never), /JSON-serializable object/)
    }
  })
})
