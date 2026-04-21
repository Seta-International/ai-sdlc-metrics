/**
 * Unit tests for IntentRegistry (Plan 02 Task 4, EI-3).
 *
 * All tests construct the registry directly and call boot() — no NestJS
 * testing module is needed. Tests cover every validation path independently.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  IntentRegistry,
  IntentRegistryValidationError,
  INTENT_REGISTRY,
  INTENT_SLUG_REGEX,
} from './intent-registry'
import type { IntentDescriptor } from '../../../domain/value-objects/intent-descriptor'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeIntent(
  slug: string,
  domain: string = slug.split('.')[0]!,
  description: string = `Test intent ${slug}`,
): IntentDescriptor {
  return { slug, domain, description }
}

// Well-known fixture slugs for the happy-path test.
const FIXTURE_A = makeIntent('fixture.a', 'fixture', 'First fixture intent')
const FIXTURE_B = makeIntent('fixture.b', 'fixture', 'Second fixture intent')
const UNCLASSIFIED = makeIntent('unclassified', 'agents', 'Fallback when no other intent applies')

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('IntentRegistry', () => {
  let registry: IntentRegistry

  beforeEach(() => {
    registry = new IntentRegistry()
  })

  // ── Test 1: Happy path ────────────────────────────────────────────────────────

  it('boots with 3 valid descriptors; list/has/get work correctly', () => {
    registry.boot([FIXTURE_A, FIXTURE_B, UNCLASSIFIED])

    const all = registry.list()
    expect(all).toHaveLength(3)
    expect(all.map((d) => d.slug)).toContain('fixture.a')
    expect(all.map((d) => d.slug)).toContain('fixture.b')
    expect(all.map((d) => d.slug)).toContain('unclassified')

    expect(registry.has('fixture.a')).toBe(true)
    expect(registry.has('fixture.b')).toBe(true)
    expect(registry.has('unclassified')).toBe(true)
    expect(registry.has('missing')).toBe(false)

    const got = registry.get('fixture.b')
    expect(got).toBeDefined()
    expect(got?.slug).toBe('fixture.b')
    expect(got?.domain).toBe('fixture')
    expect(got?.description).toBe('Second fixture intent')
  })

  // ── Test 2: Duplicate slug → throws ──────────────────────────────────────────

  it('duplicate slug across sources → boot throws, message mentions the colliding slug', () => {
    const first = makeIntent('fixture.dupe', 'fixture', 'First copy')
    const second = makeIntent('fixture.dupe', 'fixture', 'Second copy (duplicate)')

    expect(() => registry.boot([first, second])).toThrow(IntentRegistryValidationError)
    expect(() => {
      const reg2 = new IntentRegistry()
      reg2.boot([first, second])
    }).toThrow(/fixture\.dupe/)
  })

  // ── Test 3: Empty descriptor list → throws ────────────────────────────────────

  it('empty descriptor list → boot throws', () => {
    expect(() => registry.boot([])).toThrow(IntentRegistryValidationError)
    expect(() => {
      const reg2 = new IntentRegistry()
      reg2.boot([])
    }).toThrow(/at least one intent/i)
  })

  // ── Test 4: Invalid slug format → throws with regex mentioned ─────────────────

  it('invalid slug format (underscore) → boot throws with regex mentioned', () => {
    const bad = makeIntent('invalid_slug', 'invalid', 'Bad slug with underscore')

    expect(() => registry.boot([bad])).toThrow(IntentRegistryValidationError)
    expect(() => {
      const reg2 = new IntentRegistry()
      reg2.boot([bad])
    }).toThrow(INTENT_SLUG_REGEX.toString())
  })

  // ── Test 5: Double-boot → throws ─────────────────────────────────────────────

  it('calling boot twice throws IntentRegistryValidationError', () => {
    registry.boot([FIXTURE_A])

    expect(() => registry.boot([FIXTURE_A])).toThrow(IntentRegistryValidationError)
    expect(() => {
      registry.boot([FIXTURE_A])
    }).toThrow(/called more than once/i)
  })

  // ── Test 6: Domain mismatch → throws ─────────────────────────────────────────

  it('slug with mismatched domain prefix → boot throws', () => {
    // slug starts with 'planner.' but domain is 'people' — copy-paste error
    const mismatch = makeIntent('planner.foo', 'people', 'Mismatch descriptor')

    expect(() => registry.boot([mismatch])).toThrow(IntentRegistryValidationError)
    expect(() => {
      const reg2 = new IntentRegistry()
      reg2.boot([mismatch])
    }).toThrow(/domain mismatch/i)
  })

  // ── Test 7: unclassified special case accepted ────────────────────────────────

  it('"unclassified" slug with domain "agents" is accepted despite having no dot', () => {
    expect(() => registry.boot([UNCLASSIFIED])).not.toThrow()
    expect(registry.has('unclassified')).toBe(true)
    expect(registry.get('unclassified')?.domain).toBe('agents')
  })

  // ── Test 8: list() returns frozen array ──────────────────────────────────────

  it('list() returns a frozen array — mutating it throws TypeError', () => {
    registry.boot([FIXTURE_A])

    const result = registry.list()
    expect(Object.isFrozen(result)).toBe(true)
    expect(() => {
      ;(result as IntentDescriptor[]).push(FIXTURE_B)
    }).toThrow(TypeError)
  })

  // ── Test 9: Multiple violations → single aggregate throw ──────────────────────

  it('multiple violations in one boot → single aggregate throw listing all', () => {
    const badFormat = makeIntent('invalid_slug', 'invalid', 'Bad format')
    const dupe1 = makeIntent('fixture.dupe', 'fixture', 'First')
    const dupe2 = makeIntent('fixture.dupe', 'fixture', 'Second')

    let error: IntentRegistryValidationError | undefined
    try {
      registry.boot([badFormat, dupe1, dupe2])
    } catch (e) {
      error = e as IntentRegistryValidationError
    }

    expect(error).toBeInstanceOf(IntentRegistryValidationError)
    // Both violations must appear in the single aggregate message.
    expect(error!.message).toMatch(/invalid_slug/)
    expect(error!.message).toMatch(/fixture\.dupe/)
    expect(error!.message).toMatch(/2 violation/i)
  })
})

// ─── Token identity ───────────────────────────────────────────────────────────

describe('INTENT_REGISTRY token', () => {
  it('is a Symbol with the description "INTENT_REGISTRY"', () => {
    expect(typeof INTENT_REGISTRY).toBe('symbol')
    expect(INTENT_REGISTRY.description).toBe('INTENT_REGISTRY')
  })

  it('is distinct from the IntentRegistry class reference', () => {
    expect((INTENT_REGISTRY as unknown) !== IntentRegistry).toBe(true)
  })

  it('useExisting pattern: same instance resolvable by token and by class', () => {
    const instance = new IntentRegistry()
    const providerMap = new Map<symbol | (new (...args: unknown[]) => unknown), IntentRegistry>()
    providerMap.set(IntentRegistry as unknown as new () => IntentRegistry, instance)
    providerMap.set(INTENT_REGISTRY, instance) // useExisting points to same object

    const byClass = providerMap.get(IntentRegistry as unknown as new () => IntentRegistry)
    const byToken = providerMap.get(INTENT_REGISTRY)

    expect(byToken).toBeInstanceOf(IntentRegistry)
    expect(byToken).toBe(byClass)
  })
})
