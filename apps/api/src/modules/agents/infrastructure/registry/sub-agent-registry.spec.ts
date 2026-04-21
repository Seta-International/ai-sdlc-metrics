/**
 * Unit tests for SubAgentRegistry (Plan 02 Task 3).
 *
 * All tests use `defineSubAgent` to produce fixtures, a stub ToolRegistry
 * (pure object mock — no NestJS container needed), and validate the
 * invariants R-02.6..R-02.9.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { defineSubAgent } from '../../domain/services/sub-agent-factory'
import { SubAgentRegistry, SubAgentRegistryValidationError } from './sub-agent-registry'
import type { ToolRegistry } from '../tool-registry/tool-registry'

// ─── Stub ToolRegistry ────────────────────────────────────────────────────────

/**
 * Minimal stub that satisfies the `getDescriptor` surface used by
 * SubAgentRegistry.boot. Returns a truthy descriptor for any tool whose
 * name is in the `knownTools` set.
 */
function makeToolRegistry(knownTools: string[]): ToolRegistry {
  const set = new Set(knownTools)
  return {
    getDescriptor: vi.fn((name: string) => (set.has(name) ? { name } : undefined)),
  } as unknown as ToolRegistry
}

// ─── Fixture factory ──────────────────────────────────────────────────────────

/**
 * Builds a minimal valid sub-agent config for use in tests.
 * Supply overrides to exercise specific fields.
 */
function makeFixture(
  key: string,
  toolScope: string[] = ['fixtures.tools.alpha'],
): ReturnType<typeof defineSubAgent> {
  return defineSubAgent({
    key,
    domain: key.split('.')[0]!,
    description: `Test sub-agent ${key}`,
    whenToUse: 'Use in tests',
    promptTemplate: {
      body: 'Test prompt body',
      variables: z.object({ userDisplayName: z.string() }),
    },
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ answer: z.string() }),
    toolScope,
    budgets: {
      maxIterations: 4,
      wallclockMs: 10_000,
      costUsd: 0.01,
    },
    memoryScope: {
      reads: ['L1', 'L2'],
      writes: ['L1'],
    },
    model: { provider: 'openai', model: 'gpt-5.4-nano' },
    source: 'code',
  })
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('SubAgentRegistry', () => {
  let registry: SubAgentRegistry

  beforeEach(() => {
    registry = new SubAgentRegistry()
  })

  // ── Test 1: Happy path ────────────────────────────────────────────────────────

  it('boots with 2 valid descriptors; list/get/has work correctly', () => {
    const a = makeFixture('fixtures.a', ['fixtures.tools.alpha'])
    const b = makeFixture('fixtures.b', ['fixtures.tools.beta'])
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha', 'fixtures.tools.beta'])

    registry.boot([a, b], toolRegistry)

    const all = registry.list()
    expect(all).toHaveLength(2)
    expect(all.map((d) => d.key)).toContain('fixtures.a')
    expect(all.map((d) => d.key)).toContain('fixtures.b')

    const got = registry.get('fixtures.a')
    expect(got).toBeDefined()
    expect(got?.key).toBe('fixtures.a')
    expect(got?.domain).toBe('fixtures')

    expect(registry.has('fixtures.a')).toBe(true)
    expect(registry.has('fixtures.b')).toBe(true)
    expect(registry.has('fixtures.missing')).toBe(false)
  })

  // ── Test 2: Duplicate key → throws ───────────────────────────────────────────

  it('duplicate key → boot throws SubAgentRegistryValidationError naming the key', () => {
    const first = makeFixture('fixtures.dupe', ['fixtures.tools.alpha'])
    const second = makeFixture('fixtures.dupe', ['fixtures.tools.alpha'])
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha'])

    expect(() => registry.boot([first, second], toolRegistry)).toThrow(
      SubAgentRegistryValidationError,
    )
    expect(() => {
      const reg2 = new SubAgentRegistry()
      reg2.boot([first, second], toolRegistry)
    }).toThrow(/fixtures\.dupe/)
  })

  // ── Test 3: Empty descriptor list → throws ────────────────────────────────────

  it('empty descriptor list → boot throws (R-02.6 empty-deploy guard)', () => {
    const toolRegistry = makeToolRegistry([])

    expect(() => registry.boot([], toolRegistry)).toThrow(SubAgentRegistryValidationError)
    expect(() => {
      const reg2 = new SubAgentRegistry()
      reg2.boot([], toolRegistry)
    }).toThrow(/at least one sub-agent/i)
  })

  // ── Test 4: Unknown tool in toolScope → throws ────────────────────────────────

  it('toolScope references unknown tool → boot throws with specific tool name (R-02.9)', () => {
    const a = makeFixture('fixtures.a', ['fixtures.tools.known', 'fixtures.tools.unknown-tool'])
    // Only 'fixtures.tools.known' is in the registry
    const toolRegistry = makeToolRegistry(['fixtures.tools.known'])

    expect(() => registry.boot([a], toolRegistry)).toThrow(SubAgentRegistryValidationError)
    expect(() => {
      const reg2 = new SubAgentRegistry()
      reg2.boot([a], toolRegistry)
    }).toThrow(/fixtures\.tools\.unknown-tool/)
  })

  // ── Test 5: Double-boot → throws ─────────────────────────────────────────────

  it('calling boot twice throws SubAgentRegistryValidationError (double-boot is a bug)', () => {
    const a = makeFixture('fixtures.a', ['fixtures.tools.alpha'])
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha'])

    registry.boot([a], toolRegistry)

    expect(() => registry.boot([a], toolRegistry)).toThrow(SubAgentRegistryValidationError)
    expect(() => {
      registry.boot([a], toolRegistry)
    }).toThrow(/already booted|called more than once/i)
  })

  // ── Test 6: list() returns frozen array ──────────────────────────────────────

  it('list() returns a frozen array — mutating it throws TypeError', () => {
    const a = makeFixture('fixtures.a', ['fixtures.tools.alpha'])
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha'])

    registry.boot([a], toolRegistry)

    const result = registry.list()
    expect(Object.isFrozen(result)).toBe(true)
    expect(() => {
      // TypeScript won't allow this directly — cast to verify runtime freeze
      ;(result as ReturnType<typeof defineSubAgent>[]).push(makeFixture('fixtures.injected'))
    }).toThrow(TypeError)
  })

  // ── Test 7: toolScope empty array (R-02.8) ────────────────────────────────────

  it('sub-agent with empty toolScope → boot throws (R-02.8)', () => {
    // defineSubAgent allows empty toolScope at declaration time — the aggregator
    // enforces R-02.8 at boot time.
    const a = makeFixture('fixtures.a', ['fixtures.tools.alpha'])
    // Construct a descriptor with empty toolScope by bypassing defineSubAgent validation
    const badDescriptor = {
      ...a,
      toolScope: Object.freeze([]) as ReadonlyArray<string>,
    } as ReturnType<typeof defineSubAgent>
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha'])

    expect(() => registry.boot([badDescriptor], toolRegistry)).toThrow(
      SubAgentRegistryValidationError,
    )
    expect(() => {
      const reg2 = new SubAgentRegistry()
      reg2.boot([badDescriptor], toolRegistry)
    }).toThrow(/empty toolScope/i)
  })

  // ── Test 8: get() returns undefined for unknown key ───────────────────────────

  it('get() returns undefined for a key that was never registered', () => {
    const a = makeFixture('fixtures.a', ['fixtures.tools.alpha'])
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha'])

    registry.boot([a], toolRegistry)

    expect(registry.get('does.not-exist')).toBeUndefined()
  })
})
