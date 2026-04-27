/**
 * run-pipeline.factory.spec.ts — Plan 18 / PR #113 refactor.
 *
 * Verifies the closure produced by createRunPipelineFn:
 *   1. dispatches sequential pre-router DB reads (window + role + modules)
 *   2. translates each routed.kind ('disambiguation' | 'iterative' | 'bounded')
 *      into the correct TurnPipelineResult shape
 *   3. throws (and propagates) on unsupported plan topology + on infra
 *      failures bubbling up from the orchestrator
 *
 * Uses the in-memory OTel exporter to verify that recordPipelineDispatch is
 * fired with the right (kind, outcome) pair on every exit path — the metric
 * is the only side-effect the closure has beyond delegating to its deps.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics'
import { metrics } from '@opentelemetry/api'
import { createRunPipelineFn, phaseResultToPipelineResult } from './run-pipeline.factory'
import type { RunPipelineDeps } from './run-pipeline.factory'
import type { ToolGatewayPort } from '../services/tool-gateway-contracts'
import type { PhaseExecutionResult } from '../services/phase-executor-contracts'
import type {
  PhaseExecutorTurnState,
  SubAgentOutput,
  SynthesizerOutput,
} from '../services/phase-executor-contracts'
import { __INTERNAL_resetInstruments } from '../../infrastructure/observability/pipeline-metrics'

// ─── OTel in-memory exporter (mirrors pipeline-metrics.spec.ts) ──────────────
const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
const meterProvider = new MeterProvider({
  readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 100_000 })],
})
metrics.setGlobalMeterProvider(meterProvider)

beforeEach(() => {
  exporter.reset()
  __INTERNAL_resetInstruments()
})

interface DispatchPoint {
  kind: unknown
  outcome: unknown
  value: number
}

async function getDispatchPoints(): Promise<DispatchPoint[]> {
  await meterProvider.forceFlush()
  const points: DispatchPoint[] = []
  for (const rm of exporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        if (metric.descriptor.name !== 'agent_pipeline_dispatch_total') continue
        for (const dp of metric.dataPoints) {
          points.push({
            kind: dp.attributes['kind'],
            outcome: dp.attributes['outcome'],
            value: dp.value as number,
          })
        }
      }
    }
  }
  return points
}

function findPoint(
  points: DispatchPoint[],
  kind: string,
  outcome: string,
): DispatchPoint | undefined {
  return points.find((p) => p.kind === kind && p.outcome === outcome)
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fakeGateway: ToolGatewayPort = { invoke: vi.fn() }

const turnState: PhaseExecutorTurnState = {
  traceId: 'tr-1',
  tenantId: 'T1',
  userId: 'U1',
  conversationId: 'conv-1',
  sessionId: '',
  surface: 'global-chat',
  tainted: { value: false },
  routerReplanCount: 0,
}

const baseInput = {
  userUtterance: 'hello',
  conversationId: 'conv-1',
  requestContext: {
    tenantId: 'T1',
    userId: 'U1',
    traceId: 'tr-1',
    surface: 'global-chat' as const,
    roleKey: 'admin',
  },
  abortSignal: new AbortController().signal,
  streamEmitter: { emit: vi.fn(), close: vi.fn(), error: vi.fn() },
  turnState,
  toolGateway: fakeGateway,
}

function makeSynthesizerOutput(): SynthesizerOutput {
  return {
    shape: 'narrative',
    confidence: 'high',
    summary: 'done',
    sections: [],
    citations: [],
    perSubAgent: [] as SubAgentOutput[],
  } as unknown as SynthesizerOutput
}

function makeDeps(overrides: Partial<RunPipelineDeps> = {}): RunPipelineDeps {
  const windowBuilder = {
    buildGlobal: vi.fn().mockResolvedValue({} as object),
    buildInline: vi.fn().mockResolvedValue({} as object),
  } as unknown as RunPipelineDeps['windowBuilder']

  const kernelQuery = {
    getRolePermissions: vi.fn().mockResolvedValue({ permissions: [] }),
  } as unknown as RunPipelineDeps['kernelQuery']

  const adminQuery = {
    listEnabledModules: vi.fn().mockResolvedValue(new Set<string>()),
  } as unknown as RunPipelineDeps['adminQuery']

  const routerOrchestrator = {
    routeTurn: vi.fn(),
  } as unknown as RunPipelineDeps['routerOrchestrator']

  const boundedExecutor = {
    execute: vi.fn(),
  } as unknown as RunPipelineDeps['boundedExecutor']

  return {
    windowBuilder,
    kernelQuery,
    adminQuery,
    routerOrchestrator,
    boundedExecutor,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createRunPipelineFn', () => {
  it('disambiguation → refusal result + dispatch{kind=disambiguation, outcome=refused}', async () => {
    const deps = makeDeps()
    vi.mocked(deps.routerOrchestrator.routeTurn).mockResolvedValue({
      kind: 'disambiguation',
      reason: 'ambiguous query',
      sessionId: 'sess-1',
      parseRetries: 0,
    })

    const run = createRunPipelineFn(deps)
    const result = await run(baseInput)

    expect(result.shape).toBe('refusal')
    expect(result.turnEndReason).toBe('refused')
    expect(result.renderedAssistantMessage).toBe('ambiguous query')
    expect(result.toolCallNames).toEqual([])

    const points = await getDispatchPoints()
    expect(findPoint(points, 'disambiguation', 'refused')?.value).toBe(1)
  })

  it('iterative → translates PhaseExecutionResult + dispatch{kind=iterative, outcome=completed}', async () => {
    const deps = makeDeps()
    const phaseResult: PhaseExecutionResult = {
      kind: 'synthesized',
      answer: makeSynthesizerOutput(),
      drafts: [],
    }
    vi.mocked(deps.routerOrchestrator.routeTurn).mockResolvedValue({
      kind: 'iterative',
      result: phaseResult,
      sessionId: 'sess-1',
      parseRetries: 0,
    })

    const run = createRunPipelineFn(deps)
    const result = await run(baseInput)

    expect(result.turnEndReason).toBe('completed')
    expect(result.shape).toBe('narrative')
    // BoundedExecutor MUST NOT run on the iterative path (already executed inside orchestrator).
    expect(deps.boundedExecutor.execute).not.toHaveBeenCalled()

    const points = await getDispatchPoints()
    expect(findPoint(points, 'iterative', 'completed')?.value).toBe(1)
  })

  it('bounded → invokes BoundedExecutor and dispatches {kind=bounded, outcome=completed}', async () => {
    const deps = makeDeps()
    vi.mocked(deps.routerOrchestrator.routeTurn).mockResolvedValue({
      kind: 'bounded',
      plan: {
        topology: 'bounded',
        intent_slug: 'unclassified',
        phase1: [],
        phase2: [],
      } as never,
      sessionId: 'sess-1',
      parseRetries: 0,
    })
    vi.mocked(deps.boundedExecutor.execute).mockResolvedValue({
      kind: 'synthesized',
      answer: makeSynthesizerOutput(),
      drafts: [],
    })

    const run = createRunPipelineFn(deps)
    const result = await run(baseInput)

    expect(deps.boundedExecutor.execute).toHaveBeenCalledTimes(1)
    expect(result.turnEndReason).toBe('completed')

    const points = await getDispatchPoints()
    expect(findPoint(points, 'bounded', 'completed')?.value).toBe(1)
  })

  it('bounded with aborted phase result → dispatch{outcome=cancelled}', async () => {
    const deps = makeDeps()
    vi.mocked(deps.routerOrchestrator.routeTurn).mockResolvedValue({
      kind: 'bounded',
      plan: {
        topology: 'bounded',
        intent_slug: 'unclassified',
        phase1: [],
        phase2: [],
      } as never,
      sessionId: 'sess-1',
      parseRetries: 0,
    })
    vi.mocked(deps.boundedExecutor.execute).mockResolvedValue({
      kind: 'aborted',
      reason: 'user_cancelled',
    })

    const run = createRunPipelineFn(deps)
    const result = await run(baseInput)

    expect(result.turnEndReason).toBe('cancelled')
    const points = await getDispatchPoints()
    expect(findPoint(points, 'bounded', 'cancelled')?.value).toBe(1)
  })

  it('unsupported topology (e.g. direct) → throws + dispatch{outcome=error}', async () => {
    const deps = makeDeps()
    vi.mocked(deps.routerOrchestrator.routeTurn).mockResolvedValue({
      kind: 'bounded',
      plan: { topology: 'direct' } as never,
      sessionId: 'sess-1',
      parseRetries: 0,
    })

    const run = createRunPipelineFn(deps)
    await expect(run(baseInput)).rejects.toThrow(/topology 'direct' not yet supported/)

    const points = await getDispatchPoints()
    expect(findPoint(points, 'bounded', 'error')?.value).toBeGreaterThanOrEqual(1)
  })

  it('routeTurn throws → dispatch{outcome=error} and rethrows', async () => {
    const deps = makeDeps()
    vi.mocked(deps.routerOrchestrator.routeTurn).mockRejectedValue(new Error('router infra fail'))

    const run = createRunPipelineFn(deps)
    await expect(run(baseInput)).rejects.toThrow('router infra fail')

    const points = await getDispatchPoints()
    // dispatchKind defaults to 'bounded' when routeTurn fails before kind is known.
    expect(findPoint(points, 'bounded', 'error')?.value).toBeGreaterThanOrEqual(1)
  })

  it('inline surface uses buildInline; non-inline uses buildGlobal', async () => {
    const deps = makeDeps()
    vi.mocked(deps.routerOrchestrator.routeTurn).mockResolvedValue({
      kind: 'disambiguation',
      reason: 'x',
      sessionId: 's',
      parseRetries: 0,
    })

    const run = createRunPipelineFn(deps)
    await run(baseInput)
    expect(deps.windowBuilder.buildGlobal).toHaveBeenCalledTimes(1)
    expect(deps.windowBuilder.buildInline).not.toHaveBeenCalled()

    await run({
      ...baseInput,
      requestContext: { ...baseInput.requestContext, surface: 'inline' },
    })
    expect(deps.windowBuilder.buildInline).toHaveBeenCalledTimes(1)
  })
})

describe('phaseResultToPipelineResult', () => {
  it('partial → completed turnEndReason with no drafts', () => {
    const r = phaseResultToPipelineResult(
      { kind: 'partial', answer: makeSynthesizerOutput(), reason: 'limit_reached' },
      false,
    )
    expect(r.turnEndReason).toBe('completed')
    expect(r.drafts).toEqual([])
  })

  it('aborted → cancelled with empty rendered message', () => {
    const r = phaseResultToPipelineResult({ kind: 'aborted', reason: 'user_cancelled' }, true)
    expect(r.turnEndReason).toBe('cancelled')
    expect(r.renderedAssistantMessage).toBe('')
    expect(r.taintFlipped).toBe(true)
  })

  it('disambiguation → refused with the question text', () => {
    const r = phaseResultToPipelineResult({ kind: 'disambiguation', question: 'which one?' }, false)
    expect(r.turnEndReason).toBe('refused')
    expect(r.renderedAssistantMessage).toBe('which one?')
  })
})
