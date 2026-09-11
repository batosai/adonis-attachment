import { isDeepStrictEqual } from 'node:util'
import type { AttachmentMetadata } from '../../../media/media_metadata.js'
import { AttachmentMetadataConflictError, AttachmentValidationError } from '../../../errors.js'

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject
type JsonObject = { [key: string]: JsonValue }
const missing = Symbol('missing JSON property')
type Value = JsonValue | typeof missing

/** Immutable before/after snapshots; applying a mutation requires the current locked document. */
export class JsonMetadataMutation {
  readonly #before: Value
  readonly #after: Value

  constructor(before: AttachmentMetadata | undefined, after: AttachmentMetadata | undefined) {
    this.#before = snapshot(before)
    this.#after = snapshot(after)
  }

  apply(current: AttachmentMetadata | undefined): AttachmentMetadata | undefined {
    const result = merge(this.#before, this.#after, snapshot(current), [])
    return result === missing ? undefined : structuredClone(result) as AttachmentMetadata
  }
}

/** Match database JSON encoding, including omitted undefined keys and Date.toJSON(). */
function snapshot(value: AttachmentMetadata | undefined): Value {
  if (value === undefined) return missing
  try {
    const result: unknown = JSON.parse(JSON.stringify(value))
    if (result && typeof result === 'object' && !Array.isArray(result)) return result as JsonObject
  } catch {
    // Cycles, BigInt and values with invalid JSON encodings cannot be persisted.
  }
  throw new AttachmentValidationError('Attachment metadata must be a JSON-serializable object or undefined')
}

function isObject(value: Value): value is JsonObject {
  return value !== missing && value !== null && typeof value === 'object' && !Array.isArray(value)
}

function own(object: JsonObject, key: string): Value {
  return Object.hasOwn(object, key) ? object[key]! : missing
}

function merge(before: Value, after: Value, current: Value, path: readonly string[]): Value {
  if (isDeepStrictEqual(before, after) || isDeepStrictEqual(current, after)) return current

  // Two writers may independently add different children to a previously absent object.
  // Deleting/replacing an existing object in the meantime must not silently resurrect it.
  if (isObject(after) && (isObject(before) || before === missing) &&
      (isObject(current) || (current === missing && before === missing))) {
    const original = before === missing ? {} : before
    const latest = current === missing ? {} : current
    const result = structuredClone(latest)
    for (const key of new Set([...Object.keys(original), ...Object.keys(after)])) {
      const value = merge(own(original, key), own(after, key), own(latest, key), [...path, key])
      if (value === missing) delete result[key]
      else {
        // Keys are literal JSON keys, not dotted paths. Never invoke __proto__ setters.
        Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true })
      }
    }
    return result
  }

  // Scalars, arrays, type changes and whole-object deletions are indivisible edits.
  if (!isDeepStrictEqual(current, before)) throw new AttachmentMetadataConflictError(path)
  return after
}
