/**
 * completion-scorer-runner.spec.ts — Plan 12 Task 2
 *
 * Unit tests for CompletionScorerRunner.runScorers() per plan 12 §11.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CompletionScorerRunner } from './completion-scorer-runner'
import type { ScorerRegistry } from './scorer-registry'
import type { SetaScorer, ScorerResult } from '../../domain/scorer-types'
import type { SubAgentOutput } from './phase-executor-contracts'
import type { PhaseExecutorTurnState } from './phase-executor-contracts'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDeterministicScorer(id: string, result: ScorerResult): SetaScorer {
  return {
    id,
    name: `Scorer ${id}`,
    kind: 'deterministic',
    scope: 'live',
    definitionSource: 'code',
    run: vi.fn().mockResolvedValue(result),
  }
}

function makeLlmJudgeScorer(id: string): SetaScorer {
  return {
    id,
    name: `LLM Judge ${id}`,
    kind: 'llm-judge',
    scope: 'test',
    definitionSource: 'code',
    run: vi.fn().mockResolvedValue({ score: 1, passed: true }),
  }
}

function makeThrowingScorer(id: string, message: string): SetaScorer {
  return {
    id,
    name: `Throwing Scorer ${id}`,
    kind: 'deterministic',
    scope: 'live',
    definitionSource: 'code',
    run: vi.fn().mockRejectedValue(new Error(message)),
  }
}

function makeIterationOutput(): SubAgentOutput {
  return {
    kind: 'completed',
    summary: 'test summary',
    semantics: 'test semantics',
    confidence: 'high',
    sourceToolProvenance: [],
    structured: null,
    circuitBreakerState: {},
    usageTotals: {
      inputTokens: 10,
      outputTokens: 5,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0.001,
    },
  }
}

function makeTurnState(): PhaseExecutorTurnState {
  return {
    traceId: 'trace-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    sessionId: 'session-1',
    surface: 'global-chat',
    tainted: { value: false },
    routerReplanCount: 0,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CompletionScorerRunner', () => {
  let registry: ScorerRegistry
  let runner: CompletionScorerRunner

  beforeEach(() => {
    registry = {
      findById: vi.fn(),
      register: vi.fn(),
      demote: vi.fn(),
      getAll: vi.fn(),
      getDeterministic: vi.fn(),
      getLlmJudge: vi.fn(),
    } as unknown as ScorerRegistry

    runner = new CompletionScorerRunner(registry)
  })

  it('1. strategy all + all scorers pass → isComplete: true', async () => {
    const scorer1 = makeDeterministicScorer('s1', { score: 1, passed: true })
    const scorer2 = makeDeterministicScorer('s2', { score: 1, passed: true })

    vi.mocked(registry.findById)
      .mockImplementationOnce(() => scorer1)
      .mockImplementationOnce(() => scorer2)

    const result = await runner.runScorers({
      scorerIds: ['s1', 's2'],
      strategy: 'all',
      iterationOutput: makeIterationOutput(),
      turnState: makeTurnState(),
    })

    expect(result.isComplete).toBe(true)
    expect(result.results).toHaveLength(2)
    expect(result.results.every((r) => r.passed)).toBe(true)
  })

  it('2. strategy all + one scorer fails → isComplete: false', async () => {
    const scorer1 = makeDeterministicScorer('s1', { score: 1, passed: true })
    const scorer2 = makeDeterministicScorer('s2', {
      score: 0,
      passed: false,
      reason: 'quality below threshold',
    })

    vi.mocked(registry.findById)
      .mockImplementationOnce(() => scorer1)
      .mockImplementationOnce(() => scorer2)

    const result = await runner.runScorers({
      scorerIds: ['s1', 's2'],
      strategy: 'all',
      iterationOutput: makeIterationOutput(),
      turnState: makeTurnState(),
    })

    expect(result.isComplete).toBe(false)
    expect(result.results).toHaveLength(2)
  })

  it('3. strategy any + one scorer passes → isComplete: true', async () => {
    const scorer1 = makeDeterministicScorer('s1', { score: 0, passed: false })
    const scorer2 = makeDeterministicScorer('s2', { score: 1, passed: true })

    vi.mocked(registry.findById)
      .mockImplementationOnce(() => scorer1)
      .mockImplementationOnce(() => scorer2)

    const result = await runner.runScorers({
      scorerIds: ['s1', 's2'],
      strategy: 'any',
      iterationOutput: makeIterationOutput(),
      turnState: makeTurnState(),
    })

    expect(result.isComplete).toBe(true)
    expect(result.results).toHaveLength(2)
  })

  it('4. strategy any + all scorers fail → isComplete: false', async () => {
    const scorer1 = makeDeterministicScorer('s1', { score: 0, passed: false })
    const scorer2 = makeDeterministicScorer('s2', { score: 0, passed: false })

    vi.mocked(registry.findById)
      .mockImplementationOnce(() => scorer1)
      .mockImplementationOnce(() => scorer2)

    const result = await runner.runScorers({
      scorerIds: ['s1', 's2'],
      strategy: 'any',
      iterationOutput: makeIterationOutput(),
      turnState: makeTurnState(),
    })

    expect(result.isComplete).toBe(false)
    expect(result.results).toHaveLength(2)
    expect(result.results.every((r) => !r.passed)).toBe(true)
  })

  it('5. scorer throws → result has error entry; does not propagate (strategy evaluation continues)', async () => {
    const scorer1 = makeThrowingScorer('s1', 'internal error')
    const scorer2 = makeDeterministicScorer('s2', { score: 1, passed: true })

    vi.mocked(registry.findById)
      .mockImplementationOnce(() => scorer1)
      .mockImplementationOnce(() => scorer2)

    const result = await runner.runScorers({
      scorerIds: ['s1', 's2'],
      strategy: 'all',
      iterationOutput: makeIterationOutput(),
      turnState: makeTurnState(),
    })

    expect(result.results).toHaveLength(2)
    const errorResult = result.results.find((r) => r.reason?.includes('threw:'))
    expect(errorResult).toBeDefined()
    expect(errorResult?.score).toBe(0)
    expect(errorResult?.passed).toBe(false)
    expect(errorResult?.reason).toContain('s1 threw: internal error')
  })

  it('6. unknown scorerId → result has scorer not found error entry', async () => {
    vi.mocked(registry.findById).mockReturnValue(undefined)

    const result = await runner.runScorers({
      scorerIds: ['unknown-scorer'],
      strategy: 'all',
      iterationOutput: makeIterationOutput(),
      turnState: makeTurnState(),
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].score).toBe(0)
    expect(result.results[0].passed).toBe(false)
    expect(result.results[0].reason).toBe('scorer not found: unknown-scorer')
  })

  it('7. non-deterministic scorer → throws hard', async () => {
    const llmScorer = makeLlmJudgeScorer('llm-1')
    vi.mocked(registry.findById).mockReturnValue(llmScorer)

    await expect(
      runner.runScorers({
        scorerIds: ['llm-1'],
        strategy: 'all',
        iterationOutput: makeIterationOutput(),
        turnState: makeTurnState(),
      }),
    ).rejects.toThrow(
      'CompletionScorerRunner: scorer llm-1 is kind llm-judge, only deterministic scorers allowed at MVP (plan 12 §3.1 invariant 4)',
    )
  })

  it('8. empty scorerIds with strategy all → isComplete: true (vacuous truth)', async () => {
    const result = await runner.runScorers({
      scorerIds: [],
      strategy: 'all',
      iterationOutput: makeIterationOutput(),
      turnState: makeTurnState(),
    })

    expect(result.isComplete).toBe(true)
    expect(result.results).toHaveLength(0)
  })

  it('9. empty scorerIds with strategy any → isComplete: false (vacuous falsehood)', async () => {
    const result = await runner.runScorers({
      scorerIds: [],
      strategy: 'any',
      iterationOutput: makeIterationOutput(),
      turnState: makeTurnState(),
    })

    expect(result.isComplete).toBe(false)
    expect(result.results).toHaveLength(0)
  })
})
