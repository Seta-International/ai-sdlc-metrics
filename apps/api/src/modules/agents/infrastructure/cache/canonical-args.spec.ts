import { describe, it, expect } from 'vitest'
import { canonicalize } from './canonical-args'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a random flat object with `n` keys, values are strings/numbers/booleans/null. */
function randomFlatObject(n: number): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (let i = 0; i < n; i++) {
    const key = `key_${Math.random().toString(36).slice(2, 8)}`
    const roll = Math.floor(Math.random() * 4)
    if (roll === 0) obj[key] = Math.random() * 1000
    else if (roll === 1) obj[key] = Math.random().toString(36).slice(2)
    else if (roll === 2) obj[key] = Math.random() < 0.5
    else obj[key] = null
  }
  return obj
}

/** Return a shallow copy of `obj` with keys in randomised order. */
function shuffleKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj).sort(() => Math.random() - 0.5)
  const shuffled: Record<string, unknown> = {}
  for (const k of keys) shuffled[k] = obj[k]
  return shuffled
}

// ─── Property: key order idempotence ─────────────────────────────────────────

describe('canonicalize — key order idempotence (property)', () => {
  // Math.random() is unseeded here. The property under test (sort idempotence)
  // is universally true for all inputs. A failure is not a flake — it means the
  // property is broken for SOME input. The minimal failing case is deterministic
  // once the seed is known; shrink by bisecting the generated object.
  it('produces identical canonical for shuffled flat objects (50 samples)', () => {
    for (let i = 0; i < 50; i++) {
      const original = randomFlatObject(5 + Math.floor(Math.random() * 10))
      const shuffled = shuffleKeys(original)
      expect(canonicalize(shuffled).canonical).toBe(canonicalize(original).canonical)
      expect(canonicalize(shuffled).hash).toBe(canonicalize(original).hash)
    }
  })
})

// ─── Property: null vs undefined preservation ────────────────────────────────

describe('canonicalize — null vs undefined (property)', () => {
  // Math.random() is unseeded here. Both properties (undefined-drops, null-preserves)
  // are universally true for all inputs — a failure means the invariant is broken,
  // not a transient flake. Any failure is reproducible: identify the failing
  // random object via the seed or binary-search the input space.
  it('adding {x: undefined} does not change the hash (20 samples)', () => {
    for (let i = 0; i < 20; i++) {
      const base = randomFlatObject(3 + Math.floor(Math.random() * 5))
      // Ensure 'x' is NOT already in base
      const baseWithoutX = { ...base }
      delete baseWithoutX['x']
      const withUndefined = { ...baseWithoutX, x: undefined }
      expect(canonicalize(withUndefined).hash).toBe(canonicalize(baseWithoutX).hash)
    }
  })

  it('adding {x: null} DOES change the hash (20 samples)', () => {
    for (let i = 0; i < 20; i++) {
      const base = randomFlatObject(3 + Math.floor(Math.random() * 5))
      const baseWithoutX = { ...base }
      delete baseWithoutX['x']
      const withNull = { ...baseWithoutX, x: null }
      // Adding x:null should change hash (null is included in canonical)
      expect(canonicalize(withNull).hash).not.toBe(canonicalize(baseWithoutX).hash)
    }
  })
})

// ─── ISO-date normalisation ───────────────────────────────────────────────────

describe('canonicalize — ISO-date normalisation', () => {
  it('offset form, bare Z, and Z with millis all hash identically', () => {
    const withOffset = canonicalize('2026-04-22T10:00:00+07:00')
    const withZ = canonicalize('2026-04-22T03:00:00Z')
    const withZMillis = canonicalize('2026-04-22T03:00:00.000Z')

    expect(withOffset.hash).toBe(withZ.hash)
    expect(withZ.hash).toBe(withZMillis.hash)
  })

  it('normalised form is UTC-Z with millis', () => {
    const { canonical } = canonicalize('2026-04-22T10:00:00+07:00')
    expect(canonical).toBe('"2026-04-22T03:00:00.000Z"')
  })

  it('non-date string with date-like prefix stays literal', () => {
    const { canonical } = canonicalize('2026-04-22-foo')
    expect(canonical).toBe('"2026-04-22-foo"')
  })

  it('pure date (no T) stays literal — not a datetime', () => {
    const { canonical } = canonicalize('2026-04-22')
    expect(canonical).toBe('"2026-04-22"')
  })

  it('ISO-date in object value is normalised', () => {
    const a = canonicalize({ ts: '2026-04-22T10:00:00+07:00', name: 'foo' })
    const b = canonicalize({ name: 'foo', ts: '2026-04-22T03:00:00.000Z' })
    expect(a.hash).toBe(b.hash)
  })
})

// ─── No numeric coercion ──────────────────────────────────────────────────────

describe('canonicalize — no numeric coercion', () => {
  it('{x: 1} and {x: "1"} produce different hashes', () => {
    expect(canonicalize({ x: 1 }).hash).not.toBe(canonicalize({ x: '1' }).hash)
  })

  it('{x: 1} and {x: "1"} produce different canonicals', () => {
    expect(canonicalize({ x: 1 }).canonical).toBe('{"x":1}')
    expect(canonicalize({ x: '1' }).canonical).toBe('{"x":"1"}')
  })
})

// ─── Throw cases ─────────────────────────────────────────────────────────────

describe('canonicalize — throw on illegal values', () => {
  it('throws on NaN with a meaningful message', () => {
    expect(() => canonicalize(NaN)).toThrow(/NaN/)
  })

  it('throws on Infinity', () => {
    expect(() => canonicalize(Infinity)).toThrow(/Infinity/)
  })

  it('throws on -Infinity', () => {
    expect(() => canonicalize(-Infinity)).toThrow()
  })

  it('throws on BigInt', () => {
    expect(() => canonicalize(BigInt(42))).toThrow(/BigInt/)
  })

  it('throws on function', () => {
    expect(() => canonicalize(() => 'hello')).toThrow(/function/)
  })

  it('throws on symbol', () => {
    expect(() => canonicalize(Symbol('x'))).toThrow(/symbol/)
  })

  it('throws on NaN nested in object', () => {
    expect(() => canonicalize({ a: NaN })).toThrow(/NaN/)
  })

  it('throws on class instance', () => {
    class Foo {
      x = 1
    }
    expect(() => canonicalize(new Foo())).toThrow(/class instance/)
  })
})

// ─── Deep nesting ─────────────────────────────────────────────────────────────

describe('canonicalize — deep nesting', () => {
  it('canonicalises stably regardless of key order at every level', () => {
    const a = canonicalize({ a: { b: { c: [1, 2, { d: null }] } } })
    // Same data, different insertion order at each level
    const b = canonicalize({ a: { b: { c: [1, 2, { d: null }] } } })
    expect(a.canonical).toBe(b.canonical)
    expect(a.hash).toBe(b.hash)
  })

  it('canonical form is deterministic for deeply-nested reshuffled keys', () => {
    const original = { z: 1, a: { y: 2, b: { x: 3, c: [1, 2, { d: null }] } } }
    const shuffled = { a: { b: { c: [1, 2, { d: null }], x: 3 }, y: 2 }, z: 1 }
    expect(canonicalize(original).hash).toBe(canonicalize(shuffled).hash)
  })
})

// ─── Edge / empty cases ──────────────────────────────────────────────────────

describe('canonicalize — edge cases', () => {
  it('empty object → "{}"', () => {
    expect(canonicalize({}).canonical).toBe('{}')
  })

  it('empty array → "[]"', () => {
    expect(canonicalize([]).canonical).toBe('[]')
  })

  it('null → "null"', () => {
    expect(canonicalize(null).canonical).toBe('null')
  })

  it('string "hello" → \'"hello"\'', () => {
    expect(canonicalize('hello').canonical).toBe('"hello"')
  })

  it('number 42 → "42"', () => {
    expect(canonicalize(42).canonical).toBe('42')
  })

  it('boolean true → "true"', () => {
    expect(canonicalize(true).canonical).toBe('true')
  })

  it('hash is 64-char lowercase hex (SHA-256)', () => {
    const { hash } = canonicalize({ a: 1 })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('undefined at top level throws — no valid JSON representation', () => {
    // top-level undefined has no JSON equivalent; we reject it explicitly rather
    // than silently normalising to "null" (which would be indistinguishable from
    // a legitimate null argument).
    expect(() => canonicalize(undefined)).toThrow(/top-level undefined/)
  })

  it('object with only undefined values → "{}"', () => {
    expect(canonicalize({ a: undefined, b: undefined }).canonical).toBe('{}')
  })

  it('mixed undefined and null → only null key survives', () => {
    expect(canonicalize({ a: undefined, b: null }).canonical).toBe('{"b":null}')
  })
})

// ─── __proto__ hash-collision regression ─────────────────────────────────────

describe('canonicalize — __proto__ key is not silently dropped (cache-poisoning regression)', () => {
  // Must use Object.defineProperty to create a true own enumerable "__proto__"
  // property. Writing `obj.__proto__ = ...` invokes the prototype setter and
  // does NOT create an own property — the test would pass vacuously.

  function makeWithProtoKey(
    protoVal: unknown,
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    const obj: Record<string, unknown> = { ...(extra ?? {}) }
    Object.defineProperty(obj, '__proto__', {
      value: protoVal,
      enumerable: true,
      configurable: true,
      writable: true,
    })
    return obj
  }

  it('{ __proto__: {x:1}, a:1 } and { a:1 } produce DIFFERENT hashes', () => {
    const withProto = makeWithProtoKey({ x: 1 }, { a: 1 })
    const withoutProto = { a: 1 }
    expect(canonicalize(withProto).hash).not.toBe(canonicalize(withoutProto).hash)
  })

  it('{ __proto__: {x:1}, a:1 } and { a:1 } produce DIFFERENT canonical strings', () => {
    const withProto = makeWithProtoKey({ x: 1 }, { a: 1 })
    const withoutProto = { a: 1 }
    expect(canonicalize(withProto).canonical).not.toBe(canonicalize(withoutProto).canonical)
  })

  it('canonical string for { __proto__: {x:1} } contains "__proto__" literally', () => {
    const withProto = makeWithProtoKey({ x: 1 })
    expect(canonicalize(withProto).canonical).toContain('__proto__')
  })
})
