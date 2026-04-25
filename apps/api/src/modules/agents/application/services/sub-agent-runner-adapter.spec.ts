/**
 * sub-agent-runner-adapter.spec.ts — Plan 12 Task 7
 *
 * Unit tests for SubAgentRunnerAdapter.
 *
 * Tests:
 *   1. Happy path — registry returns config → buildSubAgentOutput called →
 *      returns a SubAgentOutput with the expected shape
 *   2. Unknown key → throws descriptive error
 */

import { describe, it, expect, vi } from 'vitest'
import * as z from 'zod'
import { SubAgentRunnerAdapter } from './sub-agent-runner-adapter'
import type { SubAgentRegistry } from '../../infrastructure/registry/sub-agent-registry'
import type { ValidatedSubAgentConfig } from '../../domain/services/sub-agent-types'
import type { IterativeSubAgentRunOpts } from './iterative-orchestrator'
import type { PhaseExecutorTurnState } from './phase-executor-contracts'

// ─── Minimal ValidatedSubAgentConfig fixture ─────────────────────────────────

function makeConfig(key: string): ValidatedSubAgentConfig {
  return {
    key: key as ValidatedSubAgentConfig['key'],
    domain: 'goals',
    description: 'KPI analyst',
    whenToUse: 'KPI regression queries',
    promptTemplate: {
      body: 'Analyse the KPI.',
      variables: z.object({}),
    },
    inputSchema: z.object({ utterance: z.string() }),
    outputSchema: z.object({ kpiAnswered: z.boolean() }),
    toolScope: Object.freeze(['goals.getKpi']) as ReadonlyArray<string>,
    budgets: Object.freeze({ maxIterations: 4, wallclockMs: 15_000, costUsd: 0.05 }),
    memoryScope: Object.freeze({
      reads: Object.freeze(['L1']) as ReadonlyArray<never>,
      writes: Object.freeze([]) as ReadonlyArray<never>,
    }),
    model: Object.freeze({ provider: 'openai' as const, model: 'gpt-5.4-nano' as const }),
    source: 'code',
  } as unknown as ValidatedSubAgentConfig
}

// ─── Opts fixture ─────────────────────────────────────────────────────────────

function makeTurnState(): PhaseExecutorTurnState {
  return {
    traceId: 'trace-adapter-spec',
    tenantId: 'tenant-001',
    userId: 'user-001',
    conversationId: 'conv-001',
    sessionId: 'sess-001',
    surface: 'global-chat',
    tainted: { value: false },
    routerReplanCount: 0,
  }
}

function makeOpts(
  subAgentKey: string,
  abortController?: AbortController,
): IterativeSubAgentRunOpts {
  return {
    directive: {
      sub_agent_key: subAgentKey,
      input: { utterance: 'Why did the KPI drop?' },
      reason: 'initial investigation',
    },
    phase: 1,
    abortSignal: (abortController ?? new AbortController()).signal,
    turnState: makeTurnState(),
  }
}

// ─── Registry stub ────────────────────────────────────────────────────────────

function makeRegistry(config: ValidatedSubAgentConfig | undefined): SubAgentRegistry {
  return { get: vi.fn().mockReturnValue(config) } as unknown as SubAgentRegistry
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SubAgentRunnerAdapter', () => {
  it('1. happy path: registry returns config → returns SubAgentOutput with expected shape', async () => {
    const config = makeConfig('goals.analyst')
    const registry = makeRegistry(config)
    const adapter = new SubAgentRunnerAdapter(registry)
    const opts = makeOpts('goals.analyst')

    const output = await adapter.run(opts)

    expect(output).toMatchObject({
      semantics: 'goals.analyst',
      sourceToolProvenance: expect.any(Array),
      circuitBreakerState: expect.any(Object),
      usageTotals: expect.objectContaining({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        costUsd: expect.any(Number),
      }),
    })
    expect(['completed', 'errored']).toContain(output.kind)
    expect(registry.get).toHaveBeenCalledWith('goals.analyst')
  })

  it('2. unknown key → throws descriptive error', async () => {
    const registry = makeRegistry(undefined)
    const adapter = new SubAgentRunnerAdapter(registry)
    const opts = makeOpts('goals.unknown-agent')

    await expect(adapter.run(opts)).rejects.toThrow(
      'SubAgentRunnerAdapter: unknown sub_agent_key "goals.unknown-agent"',
    )
  })
})
