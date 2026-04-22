/**
 * sub-agent-retriever.spec.ts — Plan 02 Task 8 unit tests
 *
 * Covers:
 *  1.  Top-K narrowing
 *  2.  alwaysInclude survival
 *  3.  alwaysInclude dedup
 *  4.  Deterministic ordering
 *  5.  Tiebreak lex
 *  6.  Empty candidates
 *  7.  topK >= candidates.length
 *  8.  String-overlap scoring
 *  9.  Span attrs emitted
 *  10. estimateTokens deterministic
 *  11. estimateTokens monotonic
 *  12. estimateTokens includes γ/α
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { SubAgentRetriever, estimateTokens, tokenise, scoreCandidate } from './sub-agent-retriever'
import type { RetrieveOpts, EstimateTokensOpts } from './sub-agent-retriever'
import type { ValidatedSubAgentConfig, SubAgentKey } from '../../domain/services/sub-agent-types'
import type { WindowedSummaries } from '../../domain/value-objects/windowed-summaries'
import { defineSubAgent } from '../../declare'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// vi.hoisted runs before vi.mock hoisting, ensuring the spies are defined
// before the factory closure captures them.
const { mockSetAttribute, mockEnd, mockStartSpan } = vi.hoisted(() => {
  const mockSetAttribute = vi.fn()
  const mockEnd = vi.fn()
  const mockStartSpan = vi.fn(() => ({
    setAttribute: mockSetAttribute,
    end: mockEnd,
  }))
  return { mockSetAttribute, mockEnd, mockStartSpan }
})

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({ startSpan: mockStartSpan }),
    getActiveSpan: () => undefined,
  },
  context: {
    active: () => ({}),
    with: (_ctx: unknown, fn: () => unknown) => fn(),
  },
  SpanStatusCode: { OK: 1, ERROR: 2, UNSET: 0 },
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const EMPTY_SUMMARY: WindowedSummaries = { verbatim: [], compressed: [], rolling: null }

/**
 * Build a minimal ValidatedSubAgentConfig with the given key and optional
 * description/whenToUse overrides.
 */
function makeConfig(opts: {
  key: string
  description?: string
  whenToUse?: string
}): ValidatedSubAgentConfig {
  return defineSubAgent({
    key: opts.key,
    domain: opts.key.split('.')[0] ?? 'domain',
    description: opts.description ?? `Description for ${opts.key}`,
    whenToUse: opts.whenToUse ?? `Use for ${opts.key} operations.`,
    promptTemplate: { body: 'You are an assistant.', variables: z.object({}) },
    inputSchema: z.object({ utterance: z.string() }),
    outputSchema: z.object({ result: z.string() }),
    toolScope: [],
    budgets: { maxIterations: 4, wallclockMs: 15_000, costUsd: 0.02 },
    memoryScope: { reads: ['L1'], writes: ['L1'] },
    model: { provider: 'openai', model: 'gpt-5.4-nano' },
    source: 'code',
  })
}

/**
 * Generate `n` configs with keys like `domain.agent-00`, `domain.agent-01`, …
 */
function makeNConfigs(
  n: number,
  descriptionPrefix = 'Generic agent for',
): ValidatedSubAgentConfig[] {
  return Array.from({ length: n }, (_, i) => {
    const suffix = String(i).padStart(2, '0')
    return makeConfig({
      key: `domain.agent-${suffix}`,
      description: `${descriptionPrefix} ${suffix}`,
      whenToUse: `Use when operation ${suffix} is needed.`,
    })
  })
}

function makeRetrieveOpts(
  overrides: Partial<RetrieveOpts> & { candidates: ReadonlyArray<ValidatedSubAgentConfig> },
): RetrieveOpts {
  return {
    tenantId: TENANT_ID,
    utterance: overrides.utterance ?? 'test utterance',
    recentSummary: overrides.recentSummary ?? EMPTY_SUMMARY,
    candidates: overrides.candidates,
    topK: overrides.topK ?? 3,
    alwaysInclude: overrides.alwaysInclude ?? new Set<SubAgentKey>(),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SubAgentRetriever', () => {
  let retriever: SubAgentRetriever

  beforeEach(() => {
    vi.clearAllMocks()
    retriever = new SubAgentRetriever()
  })

  // ── 1. Top-K narrowing ────────────────────────────────────────────────────

  it('returns exactly topK candidates when no alwaysInclude is set', async () => {
    const candidates = makeNConfigs(10)
    const result = await retriever.retrieve(makeRetrieveOpts({ candidates, topK: 3 }))
    expect(result).toHaveLength(3)
  })

  // ── 2. alwaysInclude survival ─────────────────────────────────────────────

  it('includes an alwaysInclude key even when it would not rank in top-K', async () => {
    // Create 10 candidates; the one with key 'domain.pinned' has no overlap
    // with the utterance "tasks plans" so it won't score in the top 3.
    const pinned = makeConfig({
      key: 'domain.pinned',
      description: 'invoice billing payment',
      whenToUse: 'Use for financial operations.',
    })
    const others = Array.from({ length: 9 }, (_, i) =>
      makeConfig({
        key: `domain.tasks-agent-${i}`,
        description: 'tasks plans user interface',
        whenToUse: 'Use when managing tasks and plans.',
      }),
    )
    const candidates = [...others, pinned]
    const alwaysInclude = new Set([pinned.key as SubAgentKey])

    const result = await retriever.retrieve(
      makeRetrieveOpts({ candidates, topK: 3, utterance: 'tasks plans', alwaysInclude }),
    )

    const keys = result.map((sa) => sa.key)
    expect(keys).toContain(pinned.key)
    // Result should be topK (3) + 1 pinned = 4
    expect(result.length).toBeGreaterThanOrEqual(3)
    expect(result.length).toBeLessThanOrEqual(4)
  })

  // ── 3. alwaysInclude dedup ────────────────────────────────────────────────

  it('does not duplicate an alwaysInclude key that already ranks in top-K', async () => {
    const star = makeConfig({
      key: 'domain.tasks-top',
      description: 'tasks plans management user',
      whenToUse: 'Use when the user asks about tasks and plans.',
    })
    const others = Array.from({ length: 9 }, (_, i) =>
      makeConfig({ key: `domain.other-${i}`, description: 'invoice finance billing' }),
    )
    const candidates = [star, ...others]
    const alwaysInclude = new Set([star.key as SubAgentKey])

    const result = await retriever.retrieve(
      makeRetrieveOpts({ candidates, topK: 3, utterance: 'tasks plans', alwaysInclude }),
    )

    const starCount = result.filter((sa) => sa.key === star.key).length
    expect(starCount).toBe(1)
  })

  // ── 4. Deterministic ordering ─────────────────────────────────────────────

  it('returns identical results on two calls with the same inputs', async () => {
    const candidates = makeNConfigs(10)
    const opts = makeRetrieveOpts({ candidates, topK: 4, utterance: 'operation 03' })

    const first = await retriever.retrieve(opts)
    const second = await retriever.retrieve(opts)

    expect(first.map((s) => s.key)).toEqual(second.map((s) => s.key))
  })

  // ── 5. Tiebreak lex ───────────────────────────────────────────────────────

  it('breaks ties by key ascending for determinism', async () => {
    // All candidates have identical descriptions so they all score the same.
    const candidates = ['domain.zzz', 'domain.aaa', 'domain.mmm'].map((key) =>
      makeConfig({ key, description: 'identical description text', whenToUse: 'identical usage' }),
    )

    const result = await retriever.retrieve(
      makeRetrieveOpts({ candidates, topK: 2, utterance: 'identical' }),
    )

    expect(result).toHaveLength(2)
    // Lex ascending: 'domain.aaa' < 'domain.mmm' < 'domain.zzz'
    expect(result[0]!.key).toBe('domain.aaa')
    expect(result[1]!.key).toBe('domain.mmm')
  })

  // ── 6. Empty candidates ───────────────────────────────────────────────────

  it('returns an empty array without crashing when candidates is empty', async () => {
    const result = await retriever.retrieve(makeRetrieveOpts({ candidates: [], topK: 3 }))
    expect(result).toEqual([])
  })

  // ── 7. topK >= candidates.length ─────────────────────────────────────────

  it('returns all candidates when topK >= candidates.length', async () => {
    const candidates = makeNConfigs(3)
    const result = await retriever.retrieve(makeRetrieveOpts({ candidates, topK: 10 }))
    expect(result).toHaveLength(3)
  })

  it('returns all candidates when topK === candidates.length', async () => {
    const candidates = makeNConfigs(5)
    const result = await retriever.retrieve(makeRetrieveOpts({ candidates, topK: 5 }))
    expect(result).toHaveLength(5)
  })

  // ── 8. String-overlap scoring ─────────────────────────────────────────────

  it('ranks a tasks-related sub-agent above an invoices sub-agent for a tasks utterance', async () => {
    const tasksAgent = makeConfig({
      key: 'planner.tasks',
      description: 'Manage tasks and task lists for the user.',
      whenToUse: 'Use when the user asks about their tasks, task lists, or work items.',
    })
    const invoiceAgent = makeConfig({
      key: 'finance.invoices',
      description: 'View and manage invoice records and billing.',
      whenToUse: 'Use when the user asks about invoices, billing, or payments.',
    })

    const result = await retriever.retrieve(
      makeRetrieveOpts({
        candidates: [invoiceAgent, tasksAgent],
        topK: 1,
        utterance: 'show me my tasks',
      }),
    )

    expect(result).toHaveLength(1)
    expect(result[0]!.key).toBe('planner.tasks')
  })

  // ── 9. Span attrs emitted ─────────────────────────────────────────────────

  it('emits the required span attributes on retrieve()', async () => {
    const candidates = makeNConfigs(5)
    await retriever.retrieve(makeRetrieveOpts({ candidates, topK: 2 }))

    // Verify startSpan was called with the retrieval span name
    expect(mockStartSpan).toHaveBeenCalledWith('router.sub_agent_retrieval')

    // Verify setAttribute calls include the required keys
    const attrCalls: Array<[string, unknown]> = mockSetAttribute.mock.calls as Array<
      [string, unknown]
    >
    const attrMap = Object.fromEntries(attrCalls)

    expect(attrMap).toHaveProperty('agent.router.retrieval_candidates_in', 5)
    expect(attrMap).toHaveProperty('agent.router.retrieval_top_k', 2)
    expect(attrMap).toHaveProperty('agent.router.retrieval_candidates_out')
    expect(attrMap).toHaveProperty('agent.router.retrieval_always_included_count')

    // Verify span was ended
    expect(mockEnd).toHaveBeenCalled()
  })
})

// ─── estimateTokens tests ─────────────────────────────────────────────────────

describe('estimateTokens', () => {
  function makeEstimateOpts(
    subAgents: ReadonlyArray<ValidatedSubAgentConfig>,
    overrides?: Partial<EstimateTokensOpts>,
  ): EstimateTokensOpts {
    return {
      subAgents,
      permissionNarrative: overrides?.permissionNarrative ?? 'You can read tasks.',
      recentSummary: overrides?.recentSummary ?? EMPTY_SUMMARY,
    }
  }

  // ── 10. Deterministic ─────────────────────────────────────────────────────

  it('returns identical values for identical inputs', () => {
    const agents = makeNConfigs(3)
    const opts = makeEstimateOpts(agents, { permissionNarrative: 'read tasks and plans' })

    expect(estimateTokens(opts)).toBe(estimateTokens(opts))
  })

  it('is deterministic across two separate calls with equivalent input', () => {
    const agents1 = makeNConfigs(3)
    const agents2 = makeNConfigs(3) // same shape but different object identities
    const narrative = 'same permission narrative'
    const summary: WindowedSummaries = {
      verbatim: [{ turnTraceId: 't1', summary: 'prior turn summary' }],
      compressed: [],
      rolling: 'rolling alpha summary',
    }

    const r1 = estimateTokens({
      subAgents: agents1,
      permissionNarrative: narrative,
      recentSummary: summary,
    })
    const r2 = estimateTokens({
      subAgents: agents2,
      permissionNarrative: narrative,
      recentSummary: summary,
    })

    expect(r1).toBe(r2)
  })

  // ── 11. Monotonic ─────────────────────────────────────────────────────────

  it('increases when a sub-agent is added', () => {
    const agents3 = makeNConfigs(3)
    const agents4 = makeNConfigs(4)
    const narrative = 'permission narrative'

    const est3 = estimateTokens(makeEstimateOpts(agents3, { permissionNarrative: narrative }))
    const est4 = estimateTokens(makeEstimateOpts(agents4, { permissionNarrative: narrative }))

    expect(est4).toBeGreaterThan(est3)
  })

  // ── 12. estimateTokens includes γ/α ──────────────────────────────────────

  it('increases when gamma summaries are added', () => {
    const agents = makeNConfigs(2)
    const narrative = 'read tasks'

    const withoutGamma = estimateTokens(
      makeEstimateOpts(agents, { permissionNarrative: narrative, recentSummary: EMPTY_SUMMARY }),
    )
    const withGamma = estimateTokens(
      makeEstimateOpts(agents, {
        permissionNarrative: narrative,
        recentSummary: {
          verbatim: [
            { turnTraceId: 't1', summary: 'User was asking about their open tasks' },
            { turnTraceId: 't2', summary: 'User reviewed a plan' },
          ],
          compressed: [],
          rolling: null,
        },
      }),
    )

    expect(withGamma).toBeGreaterThan(withoutGamma)
  })

  it('increases when alpha is present', () => {
    const agents = makeNConfigs(2)
    const narrative = 'read tasks'

    const withoutAlpha = estimateTokens(
      makeEstimateOpts(agents, {
        permissionNarrative: narrative,
        recentSummary: { verbatim: [], compressed: [], rolling: null },
      }),
    )
    const withAlpha = estimateTokens(
      makeEstimateOpts(agents, {
        permissionNarrative: narrative,
        recentSummary: {
          verbatim: [],
          compressed: [],
          rolling: 'This is the rolling conversation-level summary for the session.',
        },
      }),
    )

    expect(withAlpha).toBeGreaterThan(withoutAlpha)
  })

  it('returns a positive integer (ceil division)', () => {
    const agents = makeNConfigs(1)
    const result = estimateTokens(makeEstimateOpts(agents))
    expect(result).toBeGreaterThan(0)
    expect(Number.isInteger(result)).toBe(true)
  })
})

// ─── tokenise helper tests ────────────────────────────────────────────────────

describe('tokenise', () => {
  it('removes stopwords', () => {
    const tokens = tokenise('the tasks are in the list for my team')
    expect(tokens).not.toContain('the')
    expect(tokens).not.toContain('are')
    expect(tokens).not.toContain('in')
    expect(tokens).not.toContain('for')
    expect(tokens).not.toContain('my')
    expect(tokens).toContain('tasks')
    expect(tokens).toContain('list')
    expect(tokens).toContain('team')
  })

  it('lowercases tokens', () => {
    const tokens = tokenise('TASKS PLANS GOALS')
    expect(tokens).toContain('tasks')
    expect(tokens).toContain('plans')
    expect(tokens).toContain('goals')
  })

  it('returns empty array for empty string', () => {
    expect(tokenise('')).toEqual([])
  })

  it('returns empty array for stopwords-only string', () => {
    expect(tokenise('the a an of to')).toEqual([])
  })
})

// ─── scoreCandidate helper tests ──────────────────────────────────────────────

describe('scoreCandidate', () => {
  it('returns 0 for empty candidate text', () => {
    expect(scoreCandidate(['tasks', 'plans'], '')).toBe(0)
  })

  it('returns 0 when there is no overlap', () => {
    expect(scoreCandidate(['tasks', 'plans'], 'invoice billing payment')).toBe(0)
  })

  it('returns positive score when terms overlap', () => {
    const score = scoreCandidate(['tasks', 'plans'], 'manage tasks and plans for users')
    expect(score).toBeGreaterThan(0)
  })
})
