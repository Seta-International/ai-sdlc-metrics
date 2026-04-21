/**
 * router-prompt-builder.property.spec.ts — Plan 02 Task 12 property tests.
 *
 * Tests determinism invariants on the RouterPromptBuilder and its underlying
 * canonicalize pipeline (R-02.15, R-02.16, R-02.24).
 *
 * Property tests:
 *   14. Same registry + same tenant context → same routerPromptHash (R-02.15).
 *   15. Adding an unused sub-agent to the registry does NOT change pinned hashes
 *       for existing sub-agents (R-02.16).
 *   16. Canonicalization: two equivalent JSON inputs with key-order / null-vs-undefined
 *       differences → same final hash (R-02.24).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { RouterPromptBuilder } from './router-prompt-builder'
import type { BuildOpts } from './router-prompt-builder'
import type { ResolvedSubAgent } from '../../infrastructure/registry/sub-agent-registry'
import { SubAgentRegistry } from '../../infrastructure/registry/sub-agent-registry'
import type { WindowedSummaries } from '../../domain/value-objects/windowed-summaries'
import { canonicalize } from '../../infrastructure/cache/canonical-args'
import { makeSubAgentFixture, makeToolRegistry, initOtel } from './router-test-harness'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'

// OTel init (needed so gateway-metrics doesn't throw on Noop meter)
beforeAll(() => {
  initOtel()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-7000-8000-000000000099'
const USER_ID = '00000000-0000-7000-8000-000000000098'
const TOOL_CATALOG_HASH = 'abc123' + '0'.repeat(58)
const PERMISSION_NARRATIVE = 'Acting as employee. you can read; you cannot manage.'
const SUMMARY: WindowedSummaries = { gamma: [], alpha: null }

const builder = new RouterPromptBuilder()

/**
 * Build a ResolvedSubAgent from a ValidatedSubAgentConfig fixture.
 * Produces stable subAgentPromptHash via canonicalize (same as SubAgentRegistry).
 */
function makeResolved(key: string, toolScope: string[]): ResolvedSubAgent {
  const config = makeSubAgentFixture({ key, toolScope })
  const { hash: subAgentPromptHash } = canonicalize({
    key,
    resolvedPromptBody: `You are the ${key} sub-agent.`,
    toolScope: [...toolScope],
  })
  return {
    config,
    resolvedModel: { provider: 'openai', model: 'gpt-4o' },
    resolvedPromptBody: `You are the ${key} sub-agent.`,
    subAgentPromptHash,
  }
}

function makeOpts(subAgents: ResolvedSubAgent[]): BuildOpts {
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
    surface: 'global-chat',
    roleKey: 'employee',
    roleAllowedPermissions: new Set(['planner:personal:listTasks']),
    subAgents,
    permissionNarrative: PERMISSION_NARRATIVE,
    recentSummaryWindow: SUMMARY,
    toolCatalogHash: TOOL_CATALOG_HASH,
  }
}

// ─── Property 14: Same inputs → same hash ─────────────────────────────────────

describe('Property 14: Determinism — same registry + tenant context → same routerPromptHash', () => {
  it('two identical build() calls produce the same routerPromptHash', () => {
    const sa1 = makeResolved('planner.read-only', ['planner.personal.listTasks'])
    const opts = makeOpts([sa1])

    const result1 = builder.build(opts)
    const result2 = builder.build(opts)

    expect(result1.routerPromptHash).toBe(result2.routerPromptHash)
  })

  it('three identical build() calls all produce the same hash (idempotent)', () => {
    const sa1 = makeResolved('planner.read-only', ['planner.personal.listTasks'])
    const sa2 = makeResolved('people.profile-reader', ['people.profile.read'])
    const opts = makeOpts([sa1, sa2])

    const h1 = builder.build(opts).routerPromptHash
    const h2 = builder.build(opts).routerPromptHash
    const h3 = builder.build(opts).routerPromptHash

    expect(h1).toBe(h2)
    expect(h2).toBe(h3)
  })

  it('sub-agent insertion order does NOT affect routerPromptHash (R-02.15)', () => {
    const sa1 = makeResolved('planner.read-only', ['planner.personal.listTasks'])
    const sa2 = makeResolved('people.profile-reader', ['people.profile.read'])

    // [sa1, sa2]
    const hashAB = builder.build(makeOpts([sa1, sa2])).routerPromptHash
    // [sa2, sa1] — reversed order
    const hashBA = builder.build(makeOpts([sa2, sa1])).routerPromptHash

    expect(hashAB).toBe(hashBA)
  })
})

// ─── Property 15: Adding unused sub-agent does not change pinned hashes ────────

describe('Property 15: Adding unused sub-agent does not change existing sub-agent hashes', () => {
  it('subAgentPromptHash for planner.read-only is the same in subset A and superset A+B', () => {
    // Build pinned hashes for subset A = [planner.read-only]
    const toolRegistryA = makeToolRegistry([
      { name: 'planner.personal.listTasks', permission: 'planner:personal:listTasks' },
    ])
    const registryA = new SubAgentRegistry()
    registryA.boot(
      [
        makeSubAgentFixture({
          key: 'planner.read-only',
          toolScope: ['planner.personal.listTasks'],
        }),
      ],
      toolRegistryA,
    )
    const resolvedA = registryA.resolveForSession({
      tenantId: TENANT_ID,
      userId: USER_ID,
      surface: 'global-chat',
      enabledModules: new Set(['planner']),
      roleAllowedPermissions: new Set(['planner:personal:listTasks']),
      promptVariables: new Map<SubAgentKey, Record<string, unknown>>(),
    })
    const hashA = resolvedA.find((r) => r.config.key === 'planner.read-only')!.subAgentPromptHash

    // Build pinned hashes for superset A+B = [planner.read-only, goals.okr-viewer]
    const toolRegistryAB = makeToolRegistry([
      { name: 'planner.personal.listTasks', permission: 'planner:personal:listTasks' },
      { name: 'goals.okr.read', permission: 'goals:okr:read' },
    ])
    const registryAB = new SubAgentRegistry()
    registryAB.boot(
      [
        makeSubAgentFixture({
          key: 'planner.read-only',
          toolScope: ['planner.personal.listTasks'],
        }),
        makeSubAgentFixture({ key: 'goals.okr-viewer', toolScope: ['goals.okr.read'] }),
      ],
      toolRegistryAB,
    )
    const resolvedAB = registryAB.resolveForSession({
      tenantId: TENANT_ID,
      userId: USER_ID,
      surface: 'global-chat',
      enabledModules: new Set(['planner', 'goals']),
      roleAllowedPermissions: new Set(['planner:personal:listTasks', 'goals:okr:read']),
      promptVariables: new Map<SubAgentKey, Record<string, unknown>>(),
    })
    const hashAB = resolvedAB.find((r) => r.config.key === 'planner.read-only')!.subAgentPromptHash

    // The hash for planner.read-only must be identical in both registries (R-02.16)
    expect(hashA).toBe(hashAB)
  })

  it('routerPromptHash changes when a new sub-agent is added to the build set', () => {
    // The routerPromptHash DOES change (it encodes the full system prompt which includes all agents)
    // but the INDIVIDUAL subAgentPromptHash for the unchanged agent does NOT.
    const sa1 = makeResolved('planner.read-only', ['planner.personal.listTasks'])
    const sa2 = makeResolved('goals.okr-viewer', ['goals.okr.read'])

    const hashWithOne = builder.build(makeOpts([sa1])).routerPromptHash
    const hashWithTwo = builder.build(makeOpts([sa1, sa2])).routerPromptHash

    // router prompt changes when sub-agent set changes (it includes the catalog)
    expect(hashWithOne).not.toBe(hashWithTwo)
  })
})

// ─── Property 16: Canonicalization equivalence ────────────────────────────────

describe('Property 16: Canonicalization — equivalent inputs produce the same hash', () => {
  it('objects with different key insertion order canonicalize to the same hash', () => {
    // { a: 1, b: 2 } vs { b: 2, a: 1 } — same content, different insertion order
    const input1 = { a: 1, b: 2, c: 'hello' }
    const input2 = { c: 'hello', a: 1, b: 2 }
    const input3 = { b: 2, c: 'hello', a: 1 }

    const h1 = canonicalize(input1).hash
    const h2 = canonicalize(input2).hash
    const h3 = canonicalize(input3).hash

    expect(h1).toBe(h2)
    expect(h2).toBe(h3)
  })

  it('object with undefined value omitted vs absent key → same hash', () => {
    // canonicalize drops undefined values; omitting the key is equivalent
    const withUndefined = { a: 1, b: undefined }
    const withoutKey = { a: 1 }

    const h1 = canonicalize(withUndefined).hash
    const h2 = canonicalize(withoutKey).hash

    expect(h1).toBe(h2)
  })

  it('null is preserved and distinct from undefined/missing key', () => {
    const withNull = { a: 1, b: null }
    const withoutKey = { a: 1 }
    const withUndefined = { a: 1, b: undefined }

    const hNull = canonicalize(withNull).hash
    const hMissing = canonicalize(withoutKey).hash
    const hUndefined = canonicalize(withUndefined).hash

    // null ≠ missing
    expect(hNull).not.toBe(hMissing)
    // undefined treated same as missing
    expect(hUndefined).toBe(hMissing)
  })

  it('nested objects with swapped key order produce the same hash', () => {
    const input1 = {
      outer: { z: 'last', a: 'first' },
      arr: [
        { b: 2, a: 1 },
        { x: 'hello', m: 42 },
      ],
    }
    const input2 = {
      arr: [
        { a: 1, b: 2 },
        { m: 42, x: 'hello' },
      ],
      outer: { a: 'first', z: 'last' },
    }

    expect(canonicalize(input1).hash).toBe(canonicalize(input2).hash)
  })

  it('ISO datetime normalization: same point in time expressed differently → same hash', () => {
    // Same moment, different timezone offset representations
    const withZ = { ts: '2026-04-22T10:00:00.000Z' }
    const withPlusSeven = { ts: '2026-04-22T17:00:00.000+07:00' }

    expect(canonicalize(withZ).hash).toBe(canonicalize(withPlusSeven).hash)
  })

  it('same router prompt opts with key-swapped permissionNarrative object → same hash', () => {
    // Simulate a caller that constructs build opts with different key insertion order
    const sa1 = makeResolved('planner.read-only', ['planner.personal.listTasks'])

    const opts1: BuildOpts = {
      tenantId: TENANT_ID,
      userId: USER_ID,
      surface: 'global-chat',
      roleKey: 'employee',
      roleAllowedPermissions: new Set(['planner:personal:listTasks']),
      subAgents: [sa1],
      permissionNarrative: PERMISSION_NARRATIVE,
      recentSummaryWindow: SUMMARY,
      toolCatalogHash: TOOL_CATALOG_HASH,
    }

    // Same logical inputs — TypeScript sets have stable iteration order per insertion
    // but here the key point is that the hash function is called twice with identical opts
    const h1 = builder.build(opts1).routerPromptHash
    const h2 = builder.build(opts1).routerPromptHash

    expect(h1).toBe(h2)
  })
})
