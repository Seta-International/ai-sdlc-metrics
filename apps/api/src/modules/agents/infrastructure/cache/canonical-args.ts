/**
 * Pure canonical serialisation + SHA-256 hash for tool-invocation argument
 * deduplication. Deterministic key sort, undefined-drop, null-preserve,
 * ISO-datetime UTC-normalisation, array-order preservation, no numeric coercion.
 */

import { createHash } from 'node:crypto'

/**
 * Thrown by `canonicalize()` when the input cannot be serialised to a canonical
 * JSON string. Using a named subclass lets callers distinguish canonicalize errors
 * from unrelated TypeErrors.
 */
export class CanonicalizeError extends TypeError {
  constructor(message: string) {
    super(`canonicalize: ${message}`)
    this.name = 'CanonicalizeError'
  }
}

/**
 * Matches strings that look like a datetime (date + 'T' suffix).
 * A bare date like "2026-04-22" (no T) is NOT a datetime — handled separately.
 */
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T/

/**
 * If `value` is an ISO-datetime string that `new Date()` can parse,
 * return it normalised to UTC-Z with millisecond precision.
 * Otherwise return `value` unchanged.
 */
function normaliseIsoDatetime(value: string): string {
  if (!ISO_DATETIME_RE.test(value)) return value

  const d = new Date(value)
  // Invalid dates (e.g. "2026-04-22T99:99:99Z") produce NaN from getTime()
  if (Number.isNaN(d.getTime())) return value

  return d.toISOString() // always UTC-Z, millisecond precision
}

function canonicaliseValue(value: unknown): unknown {
  if (value === null) return null
  if (value === undefined) return undefined // caller must drop this

  const t = typeof value

  if (t === 'boolean') return value

  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new CanonicalizeError(
        `illegal numeric value ${String(value)} — NaN and Infinity have no JSON representation`,
      )
    }
    return value
  }

  if (t === 'string') {
    return normaliseIsoDatetime(value as string)
  }

  if (t === 'bigint') {
    throw new CanonicalizeError(`BigInt values cannot be represented in canonical JSON`)
  }

  if (t === 'function') {
    throw new CanonicalizeError(`function values cannot be canonicalised`)
  }

  if (t === 'symbol') {
    throw new CanonicalizeError(`symbol values cannot be canonicalised`)
  }

  if (Array.isArray(value)) {
    // Preserve order; canonicalise each element recursively
    const result: unknown[] = []
    for (const el of value as unknown[]) {
      result.push(canonicaliseValue(el))
    }
    return result
  }

  if (t === 'object') {
    // Dates are first-class in agent tool args + results — coerce to canonical ISO-8601 UTC-Z.
    // Invalid Date (NaN) throws for consistency with NaN/Infinity rejection.
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new CanonicalizeError('invalid Date (NaN) cannot be canonicalised')
      }
      return value.toISOString()
    }

    // Guard against class instances that are not plain objects or arrays.
    // Plain objects have Object as constructor or no constructor (Object.create(null)).
    const proto = Object.getPrototypeOf(value)
    if (proto !== null && proto !== Object.prototype) {
      throw new CanonicalizeError(
        `class instances (constructor: ${(value as object).constructor?.name ?? 'unknown'}) cannot be canonicalised`,
      )
    }

    const obj = value as Record<string, unknown>
    const sortedKeys = Object.keys(obj).sort()
    // Use Object.create(null) so that a literal "__proto__" key is stored as an
    // ordinary own property rather than invoking the prototype setter.
    const result = Object.create(null) as Record<string, unknown>
    for (const key of sortedKeys) {
      const v = canonicaliseValue(obj[key])
      if (v !== undefined) {
        result[key] = v
      }
    }
    return result
  }

  // Unreachable in standard JS/TS, but guard anyway
  throw new CanonicalizeError(`unsupported value type "${t}"`)
}

export interface CanonicalizeResult {
  canonical: string
  hash: string
}

/**
 * Stable version hash for this canonicaliser implementation.
 *
 * Computed once at module load from a deterministic sentinel object. When the
 * canonicalisation rules change (e.g. a new normalisation pass is added) this
 * constant MUST be updated so existing `agent_session` rows with mismatched hashes
 * are detected as drift by the orchestrator.
 *
 * Do NOT derive this from Date.now() or Math.random() — it must be stable across
 * restarts.
 */
export const CANONICALIZER_VERSION_HASH: string = (() => {
  const { hash } = _computeCanonicalVersion()
  return hash
})()

function _computeCanonicalVersion(): CanonicalizeResult {
  // Sentinel: bumping this string triggers a new hash → existing sessions detect drift.
  const canonical = JSON.stringify({ canonicalizerVersion: '1' })
  const hash = createHash('sha256').update(canonical).digest('hex')
  return { canonical, hash }
}

/**
 * Deterministically serialise `args` to a stable JSON string + SHA-256 hex hash.
 *
 * Rules:
 * - Object keys sorted alphabetically ascending (deep)
 * - `undefined` values dropped; `null` preserved
 * - No numeric coercion (`"1"` ≠ `1`)
 * - ISO-datetime strings normalised to UTC-Z (millisecond precision)
 * - Arrays: order preserved; elements recursively canonicalised
 * - NaN / Infinity → throw
 * - BigInt / Function / Symbol / class instances → throw
 */
export function canonicalize(args: unknown): CanonicalizeResult {
  if (args === undefined) {
    // top-level undefined has no valid JSON representation; reject explicitly
    // rather than silently normalising to "null" (which would confuse it with
    // a legitimate null argument).
    throw new CanonicalizeError(
      `top-level undefined is not a valid argument — pass null or omit the field`,
    )
  }
  const normalised = canonicaliseValue(args)
  const canonical = JSON.stringify(normalised) as string
  const hash = createHash('sha256').update(canonical).digest('hex')
  return { canonical, hash }
}
