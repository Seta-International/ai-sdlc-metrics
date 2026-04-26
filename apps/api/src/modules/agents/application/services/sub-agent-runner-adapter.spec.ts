/**
 * sub-agent-runner-adapter.spec.ts — Plan 17 PR 2 Task 6
 *
 * Unit tests for SubAgentRunnerAdapter wired through the real ReAct loop driver
 * (Task 5) + tool-gateway-bridge (Task 4) + SubAgentLlmClient (Task 3).
 *
 * Tests:
 *   1. Happy path — finishReason 'stop', usageTotals threaded → kind='completed'
 *   2. Unknown sub_agent_key → throws descriptive error
 *   3. Pre-aborted signal → kind='aborted'
 *   4. Hard tripwire → kind='errored' (rawStructured={}, schema fails)
 *   5. Ceiling-hit (finishReason='tool-calls') → kind='ceiling_hit'
 *   6. UsageTotals flow through driver into result on both happy + ceiling paths
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as z from 'zod'
import { SubAgentRunnerAdapter } from './sub-agent-runner-adapter'
import * as subAgentMetrics from '../../infrastructure/observability/sub-agent-metrics'
import type { SubAgentRegistry } from '../../infrastructure/registry/sub-agent-registry'
import type { ValidatedSubAgentConfig } from '../../domain/services/sub-agent-types'
import type { IterativeSubAgentRunOpts } from './iterative-orchestrator'
import type { PhaseExecutorTurnState } from './phase-executor-contracts'
import type {
  SubAgentLlmClient,
  SubAgentLlmClientResult,
} from '../../infrastructure/llm/sub-agent-llm-client'
import type { ToolGatewayPort, ToolGatewayInvokeInput } from './tool-gateway-contracts'
import type { ToolGatewayResult, Tripwire } from '../../infrastructure/guards/tripwire'
import type { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import { HardTripwireError } from '../../infrastructure/tool-gateway/tool-gateway-bridge'

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

// ─── Stubs ────────────────────────────────────────────────────────────────────

function makeRegistry(config: ValidatedSubAgentConfig | undefined): SubAgentRegistry {
  return { get: vi.fn().mockReturnValue(config) } as unknown as SubAgentRegistry
}

function makeDescriptor(name: string): AgentToolDescriptor {
  return {
    name,
    procedure: 'query',
    permission: 'goals:kpi:read',
    inputSchema: z.object({ x: z.string() }),
    outputSchema: undefined,
    meta: {
      whenToUse: 'use it',
      whenNotToUse: 'never',
      examples: [{ input: 'hi', callArgs: { x: '1' } }],
    },
  }
}

function makeToolRegistry(descriptors: Record<string, AgentToolDescriptor>): ToolRegistry {
  return {
    getDescriptor: (name: string) => descriptors[name],
  } as unknown as ToolRegistry
}

function makeLlmClient(impl: SubAgentLlmClient['runWithTools']): SubAgentLlmClient {
  return { runWithTools: vi.fn(impl) }
}

function makeGateway(
  impl?: (input: ToolGatewayInvokeInput) => Promise<ToolGatewayResult>,
): ToolGatewayPort {
  return {
    invoke: vi.fn(impl ?? (async () => ({ kind: 'ok', result: 'v', fromCache: false }))),
  }
}

function happyResult(overrides: Partial<SubAgentLlmClientResult> = {}): SubAgentLlmClientResult {
  return {
    rawStructured: { kpiAnswered: true },
    text: 'KPI answered',
    steps: [],
    usage: {
      inputTokens: 50,
      outputTokens: 20,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0,
    },
    finishReason: 'stop',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SubAgentRunnerAdapter', () => {
  let iterationSpy: ReturnType<typeof vi.spyOn>
  let toolFailureSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    iterationSpy = vi.spyOn(subAgentMetrics, 'recordSubAgentIteration').mockImplementation(() => {})
    toolFailureSpy = vi
      .spyOn(subAgentMetrics, 'recordSubAgentToolFailure')
      .mockImplementation(() => {})
  })

  it('1. happy path: returns kind=completed with usageTotals.inputTokens === 50', async () => {
    const registry = makeRegistry(makeConfig('goals.analyst'))
    const llm = makeLlmClient(async () => happyResult())
    const gateway = makeGateway()
    const toolRegistry = makeToolRegistry({ 'goals.getKpi': makeDescriptor('goals.getKpi') })

    const adapter = new SubAgentRunnerAdapter(registry, llm, gateway, toolRegistry)
    const output = await adapter.run(makeOpts('goals.analyst'))

    expect(output.kind).toBe('completed')
    expect(output.usageTotals.inputTokens).toBe(50)
    expect(output.usageTotals.outputTokens).toBe(20)
    expect(output.semantics).toBe('goals.analyst')
    expect(registry.get).toHaveBeenCalledWith('goals.analyst')
    expect(iterationSpy).toHaveBeenCalledWith({
      subAgentKey: 'goals.analyst',
      outcome: 'completed',
    })
    expect(toolFailureSpy).not.toHaveBeenCalled()
  })

  it('2. unknown sub_agent_key → throws descriptive error', async () => {
    const registry = makeRegistry(undefined)
    const adapter = new SubAgentRunnerAdapter(
      registry,
      makeLlmClient(async () => happyResult()),
      makeGateway(),
      makeToolRegistry({}),
    )

    await expect(adapter.run(makeOpts('goals.unknown-agent'))).rejects.toThrow(
      /unknown sub_agent_key/,
    )
  })

  it('3. pre-aborted signal → kind=aborted with abortReason="user"', async () => {
    const registry = makeRegistry(makeConfig('goals.analyst'))
    const llm = makeLlmClient(async () => happyResult())
    const adapter = new SubAgentRunnerAdapter(
      registry,
      llm,
      makeGateway(),
      makeToolRegistry({ 'goals.getKpi': makeDescriptor('goals.getKpi') }),
    )

    const ctl = new AbortController()
    ctl.abort()

    const output = await adapter.run(makeOpts('goals.analyst', ctl))

    expect(output.kind).toBe('aborted')
    expect(output.abortReason).toBe('user')
    // LLM must NOT be called when pre-aborted
    expect((llm.runWithTools as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
    expect(iterationSpy).toHaveBeenCalledWith({
      subAgentKey: 'goals.analyst',
      outcome: 'aborted',
    })
  })

  it('4. hard tripwire from LLM client → kind=errored', async () => {
    const registry = makeRegistry(makeConfig('goals.analyst'))
    const tripwire: Tripwire = {
      kind: 'tripwire',
      variant: 'infra_error',
      disposition: 'abort',
      context: {},
    }
    const llm = makeLlmClient(async () => {
      throw new HardTripwireError(tripwire, 't1')
    })

    const adapter = new SubAgentRunnerAdapter(
      registry,
      llm,
      makeGateway(),
      makeToolRegistry({ 'goals.getKpi': makeDescriptor('goals.getKpi') }),
    )

    const output = await adapter.run(makeOpts('goals.analyst'))

    expect(output.kind).toBe('errored')
    expect(output.summary).toContain('infra_error')
    expect(iterationSpy).toHaveBeenCalledWith({
      subAgentKey: 'goals.analyst',
      outcome: 'errored',
    })
    expect(toolFailureSpy).toHaveBeenCalledWith({
      subAgentKey: 'goals.analyst',
      toolName: 't1',
      tripwireKind: 'infra_error',
      severity: 'hard',
    })
  })

  it('5. ceiling-hit (finishReason=tool-calls) → kind=ceiling_hit', async () => {
    const registry = makeRegistry(makeConfig('goals.analyst'))
    const llm = makeLlmClient(async () =>
      happyResult({
        finishReason: 'tool-calls',
        usage: {
          inputTokens: 5,
          outputTokens: 3,
          inputCachedRead: 0,
          inputCachedWrite: 0,
          outputReasoning: 0,
          costUsd: 0,
        },
      }),
    )

    const adapter = new SubAgentRunnerAdapter(
      registry,
      llm,
      makeGateway(),
      makeToolRegistry({ 'goals.getKpi': makeDescriptor('goals.getKpi') }),
    )

    const output = await adapter.run(makeOpts('goals.analyst'))

    expect(output.kind).toBe('ceiling_hit')
    expect(iterationSpy).toHaveBeenCalledWith({
      subAgentKey: 'goals.analyst',
      outcome: 'ceiling_hit',
    })
  })

  it('6. usageTotals flows through driver into result on both happy and ceiling-hit paths', async () => {
    // Happy path → 50 input tokens
    {
      const registry = makeRegistry(makeConfig('goals.analyst'))
      const llm = makeLlmClient(async () => happyResult())
      const adapter = new SubAgentRunnerAdapter(
        registry,
        llm,
        makeGateway(),
        makeToolRegistry({ 'goals.getKpi': makeDescriptor('goals.getKpi') }),
      )
      const output = await adapter.run(makeOpts('goals.analyst'))
      expect(output.usageTotals.inputTokens).toBe(50)
    }
    // Ceiling-hit path → 5 input tokens
    {
      const registry = makeRegistry(makeConfig('goals.analyst'))
      const llm = makeLlmClient(async () =>
        happyResult({
          finishReason: 'tool-calls',
          usage: {
            inputTokens: 5,
            outputTokens: 3,
            inputCachedRead: 0,
            inputCachedWrite: 0,
            outputReasoning: 0,
            costUsd: 0,
          },
        }),
      )
      const adapter = new SubAgentRunnerAdapter(
        registry,
        llm,
        makeGateway(),
        makeToolRegistry({ 'goals.getKpi': makeDescriptor('goals.getKpi') }),
      )
      const output = await adapter.run(makeOpts('goals.analyst'))
      expect(output.kind).toBe('ceiling_hit')
      expect(output.usageTotals.inputTokens).toBe(5)
    }
  })
})
