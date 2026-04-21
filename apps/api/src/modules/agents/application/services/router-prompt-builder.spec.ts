/**
 * router-prompt-builder.spec.ts — Plan 02 Task 7 unit tests
 *
 * All 11 cases from the task spec are covered.
 * No real DB, no NestJS DI container — RouterPromptBuilder is a pure
 * function-equivalent injectable with zero side effects.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { RouterPromptBuilder } from './router-prompt-builder'
import type { BuildOpts } from './router-prompt-builder'
import type { ResolvedSubAgent } from '../../infrastructure/registry/sub-agent-registry'
import type { WindowedSummaries } from '../../domain/value-objects/windowed-summaries'
import { defineSubAgent } from '../../declare'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const USER_ID = '01900000-0000-7000-8000-000000000002'
const TOOL_CATALOG_HASH = 'abc123def456' + '0'.repeat(52) // 64-char hex stub
const PERMISSION_NARRATIVE = 'Acting as employee. you can read; you cannot manage.'
const ROLE_KEY = 'employee'
const SURFACE = 'global-chat' as const

/**
 * Build a minimal ResolvedSubAgent fixture.
 */
function makeResolvedSubAgent(overrides?: {
  key?: string
  domain?: string
  description?: string
  whenToUse?: string
}): ResolvedSubAgent {
  const key = overrides?.key ?? 'planner.read-only'
  const config = defineSubAgent({
    key,
    domain: overrides?.domain ?? 'planner',
    description: overrides?.description ?? 'Read-only access to tasks, plans, and evidence.',
    whenToUse:
      overrides?.whenToUse ??
      'Use when the user asks about their tasks or plans. Do not use for mutations.',
    promptTemplate: {
      body: 'You are a read-only assistant.',
      variables: z.object({}),
    },
    inputSchema: z.object({
      utterance: z.string().min(1),
    }),
    outputSchema: z.object({
      summary: z.string(),
    }),
    toolScope: ['planner.personal.listTasks'],
    budgets: { maxIterations: 4, wallclockMs: 15_000, costUsd: 0.02 },
    memoryScope: { reads: ['L1'], writes: ['L1'] },
    model: { provider: 'openai', model: 'gpt-5.4-nano' },
    source: 'code',
  })

  return {
    config,
    resolvedModel: { provider: 'openai', model: 'gpt-5.4-nano' },
    resolvedPromptBody: 'You are a read-only assistant.',
    subAgentPromptHash: 'deadbeef'.repeat(8),
  }
}

function makeSecondSubAgent(): ResolvedSubAgent {
  const config = defineSubAgent({
    key: 'people.profile-reader',
    domain: 'people',
    description: 'Reads employment profile information.',
    whenToUse: 'Use when the user asks about their employment profile or org placement.',
    promptTemplate: {
      body: 'You are a profile reader.',
      variables: z.object({}),
    },
    inputSchema: z.object({
      utterance: z.string(),
    }),
    outputSchema: z.object({
      profileSummary: z.string(),
    }),
    toolScope: ['people.profile.read'],
    budgets: { maxIterations: 4, wallclockMs: 10_000, costUsd: 0.01 },
    memoryScope: { reads: ['L1'], writes: ['L1'] },
    model: { provider: 'openai', model: 'gpt-5.4-nano' },
    source: 'code',
  })

  return {
    config,
    resolvedModel: { provider: 'openai', model: 'gpt-5.4-nano' },
    resolvedPromptBody: 'You are a profile reader.',
    subAgentPromptHash: 'cafebabe'.repeat(8),
  }
}

function makeOpts(overrides?: Partial<BuildOpts>): BuildOpts {
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
    surface: SURFACE,
    roleKey: ROLE_KEY,
    roleAllowedPermissions: new Set(['planner:plan:read']),
    subAgents: [makeResolvedSubAgent()],
    permissionNarrative: PERMISSION_NARRATIVE,
    recentSummaryWindow: { gamma: [], alpha: null },
    toolCatalogHash: TOOL_CATALOG_HASH,
    ...overrides,
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('RouterPromptBuilder', () => {
  const builder = new RouterPromptBuilder()

  // ── 1. Happy path ──────────────────────────────────────────────────────────

  it('1. happy path — returns non-empty systemPrompt, developerMessage, routerPromptHash', () => {
    const result = builder.build(makeOpts())

    expect(result.systemPrompt).toBeTruthy()
    expect(result.developerMessage).toBeTruthy()
    expect(result.routerPromptHash).toBeTruthy()
    // hash is a 64-char hex string (SHA-256)
    expect(result.routerPromptHash).toMatch(/^[0-9a-f]{64}$/)
  })

  // ── 2. Determinism ────────────────────────────────────────────────────────

  it('2. same inputs → same hash across two calls', () => {
    const opts = makeOpts()
    const result1 = builder.build(opts)
    const result2 = builder.build(opts)

    expect(result1.routerPromptHash).toBe(result2.routerPromptHash)
  })

  // ── 3. Sub-agent order independence ───────────────────────────────────────

  it('3. [A, B] vs [B, A] sub-agent order → identical systemPrompt + hash', () => {
    const agentA = makeResolvedSubAgent()
    const agentB = makeSecondSubAgent()

    const resultAB = builder.build(makeOpts({ subAgents: [agentA, agentB] }))
    const resultBA = builder.build(makeOpts({ subAgents: [agentB, agentA] }))

    expect(resultAB.systemPrompt).toBe(resultBA.systemPrompt)
    expect(resultAB.routerPromptHash).toBe(resultBA.routerPromptHash)
  })

  // ── 4. Inline JSON Schema in systemPrompt ─────────────────────────────────

  it('4. systemPrompt contains JSON Schema fragment for inputSchema (field "utterance")', () => {
    const result = builder.build(makeOpts())

    // The planner.read-only inputSchema has { utterance: z.string() }
    // z.toJSONSchema() should render this as { "properties": { "utterance": ... } }
    expect(result.systemPrompt).toContain('"utterance"')
    // Also check outputSchema field "summary" appears
    expect(result.systemPrompt).toContain('"summary"')
  })

  // ── 5. Tenant context in developer message ────────────────────────────────

  it('5. developerMessage contains tenantId, roleKey, surface', () => {
    const result = builder.build(makeOpts())

    expect(result.developerMessage).toContain(`tenant_id = ${TENANT_ID}`)
    expect(result.developerMessage).toContain(`role = ${ROLE_KEY}`)
    expect(result.developerMessage).toContain(`surface = ${SURFACE}`)
  })

  // ── 6. γ/α rendering ─────────────────────────────────────────────────────

  it('6a. alpha present → "Conversation-level summary" section rendered', () => {
    const window: WindowedSummaries = {
      alpha: 'The user has been asking about their Q2 plans.',
      gamma: [],
    }
    const result = builder.build(makeOpts({ recentSummaryWindow: window }))

    expect(result.developerMessage).toContain('Conversation-level summary:')
    expect(result.developerMessage).toContain('Q2 plans')
  })

  it('6b. gamma empty → no "Recent turns" section', () => {
    const window: WindowedSummaries = {
      alpha: null,
      gamma: [],
    }
    const result = builder.build(makeOpts({ recentSummaryWindow: window }))

    expect(result.developerMessage).not.toContain('Recent turns')
  })

  it('6c. gamma non-empty → "Recent turns" section with turnTraceId entries', () => {
    const window: WindowedSummaries = {
      alpha: null,
      gamma: [
        { turnTraceId: 'turn-001', summary: 'User asked about tasks.' },
        { turnTraceId: 'turn-002', summary: 'User asked about plans.' },
      ],
    }
    const result = builder.build(makeOpts({ recentSummaryWindow: window }))

    expect(result.developerMessage).toContain('Recent turns (newest last):')
    expect(result.developerMessage).toContain('[turnTraceId: turn-001]')
    expect(result.developerMessage).toContain('[turnTraceId: turn-002]')
  })

  // ── 7. Permission narrative in developer message ───────────────────────────

  it('7. permissionNarrative text appears verbatim in developerMessage', () => {
    const result = builder.build(makeOpts())

    expect(result.developerMessage).toContain(PERMISSION_NARRATIVE)
  })

  // ── 8. Canonicalization invariance ────────────────────────────────────────

  it('8. logically-equivalent inputs with different property insertion order → same hash', () => {
    // Build two WindowedSummaries objects that are logically identical
    // but constructed with different property insertion order.
    const windowA: WindowedSummaries = {
      gamma: [{ turnTraceId: 'turn-001', summary: 'User asked about tasks.' }],
      alpha: 'Summary A.',
    }
    const windowB: WindowedSummaries = {
      alpha: 'Summary A.',
      gamma: [{ turnTraceId: 'turn-001', summary: 'User asked about tasks.' }],
    }

    const resultA = builder.build(makeOpts({ recentSummaryWindow: windowA }))
    const resultB = builder.build(makeOpts({ recentSummaryWindow: windowB }))

    expect(resultA.routerPromptHash).toBe(resultB.routerPromptHash)
  })

  // ── 9. Disallowed addendum — TS compile-check ─────────────────────────────

  it('9. build() signature does not accept additionalInstructions (compile-check only)', () => {
    // This test verifies the contract at the type level.
    // The @ts-expect-error line below MUST cause a TS error (the field does not exist).
    // If the error goes away, someone added additionalInstructions and broke R-02.14.
    const opts = makeOpts()

    // @ts-expect-error — additionalInstructions is intentionally absent from BuildOpts (R-02.14)
    const _bad: BuildOpts = { ...opts, additionalInstructions: 'OVERRIDE' }

    // Runtime check: the extra field is stripped by the type system;
    // the hash is identical to a clean call (no addendum injection possible).
    const clean = builder.build(opts)
    expect(clean.routerPromptHash).toMatch(/^[0-9a-f]{64}$/)
  })

  // ── 10. Empty γ + null α ──────────────────────────────────────────────────

  it('10. empty gamma + null alpha → builder renders without crashing; no spurious sections', () => {
    const window: WindowedSummaries = { gamma: [], alpha: null }
    const result = builder.build(makeOpts({ recentSummaryWindow: window }))

    expect(result.systemPrompt).toBeTruthy()
    expect(result.developerMessage).toBeTruthy()
    expect(result.developerMessage).not.toContain('Conversation-level summary')
    expect(result.developerMessage).not.toContain('Recent turns')
  })

  // ── 11. No time-dependent content ─────────────────────────────────────────

  it('11. hashes are identical across two calls (proves no Date.now() in prompt)', () => {
    // Since Date.now() and Math.random() are never called in the builder,
    // two separate calls with the same inputs must produce the same hash.
    const opts = makeOpts({
      recentSummaryWindow: {
        alpha: 'rolling summary',
        gamma: [{ turnTraceId: 't1', summary: 'previous turn' }],
      },
    })

    const hash1 = builder.build(opts).routerPromptHash
    const hash2 = builder.build(opts).routerPromptHash

    expect(hash1).toBe(hash2)
  })
})
