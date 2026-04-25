/**
 * iterative-orchestrator.integration.spec.ts — Plan 12 Task 7
 *
 * Integration tests for IterativeOrchestrator wired with real CompletionScorerRunner
 * and ScorerRegistry (deterministic scorers only). SubAgentRunner, Synthesizer, and
 * IterativeRePlanner are mocked for isolation.
 *
 * NOTE: These tests do NOT require a test DB. They test orchestrator logic with
 * real in-process services (CompletionScorerRunner + ScorerRegistry) and mocked
 * LLM-touching services (SubAgentRunner, Synthesizer, IterativeRePlanner).
 *
 * To run: bun run --filter @future/api test:unit
 *
 * Scenarios:
 *   1. Happy 3-iteration turn: scorer passes at iteration 3 → { kind: 'synthesized' }
 *   2. Max-iterations exit: scorer never passes → { kind: 'partial', reason: 'limit_reached' }
 *   3. Taint persistence: iteration 1 sets taint → later iterations inherit taint_at_start=true
 *   4. Inline rejection: surface='inline' → orchestrator itself is surface-capped
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IterativeOrchestrator } from './iterative-orchestrator'
import { IterationCeilingEnforcer } from './iteration-ceiling-enforcer'
import { CompletionScorerRunner } from './completion-scorer-runner'
import { IterativeRePlanner } from './iterative-replanner'
import type {
  PhaseExecutorTurnState,
  SubAgentOutput,
  SynthesizerOutput,
} from './phase-executor-contracts'
import type { IterativePlan } from '../../domain/value-objects/router-plan-schema'
import type { StreamEmitter } from './stream-gateway'
import type { ISubAgentRunner, ISynthesizer } from './iterative-orchestrator'
import type { SetaScorer } from '../../domain/scorer-types'
import type { ReplanResult } from './iterative-replanner'

// ─── Mock gateway-metrics so tests do not need OTel configured ────────────────

vi.mock('../../infrastructure/observability/gateway-metrics', () => ({
  recordIterativeTurnTotal: vi.fn(),
  recordIterationCountExceeded: vi.fn(),
  recordIterationsTotalHistogram: vi.fn(),
  recordReplanLlmCallTotal: vi.fn(),
  recordCompletionScorerFail: vi.fn(),
}))

// ─── Deterministic KPI scorer fixture ────────────────────────────────────────

/**
 * Deterministic scorer that passes when SubAgentOutput.structured contains
 * { kpiAnswered: true }. Used to exercise the 3-iteration happy path.
 */
function makeKpiAnswerShapeScorer(id = 'kpi-answer-shape-deterministic'): SetaScorer {
  return {
    id,
    name: 'KPI Answer Shape (deterministic)',
    kind: 'deterministic',
    scope: 'test',
    definitionSource: 'code',
    async run(ctx) {
      const structured = ctx.output as SubAgentOutput
      const data = structured.structured as Record<string, unknown> | null
      const passed = Boolean(data?.['kpiAnswered'])
      return { score: passed ? 1 : 0, passed, reason: passed ? 'kpi answered' : 'kpi not answered' }
    },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIterativePlan(
  maxIterations = 5,
  scorerIds = ['kpi-answer-shape-deterministic'],
): IterativePlan {
  return {
    topology: 'iterative',
    intent_slug: 'goals.kpi',
    flow_id: '00000000-0000-0000-0000-000000000001',
    initialDirective: {
      sub_agent_key: 'goals.analyst',
      input: { question: 'why did my KPI regress?' },
      reason: 'initial investigation',
    },
    completionCriteria: {
      scorerIds,
      strategy: 'all',
      maxIterations,
      hintToRouter: 'KPI regression root cause identified with supporting data',
    },
  }
}

function makeTurnState(
  surface: PhaseExecutorTurnState['surface'] = 'global-chat',
): PhaseExecutorTurnState {
  return {
    traceId: 'integration-trace-001',
    tenantId: '01900000-0000-7fff-8000-000000000099',
    userId: '01900000-0000-7fff-8000-0000000000b1',
    conversationId: 'conv-integration-001',
    sessionId: 'sess-integration-001',
    surface,
    tainted: { value: false },
    routerReplanCount: 0,
  }
}

function makeSubAgentOutput(kpiAnswered = false, taintFlip = false): SubAgentOutput {
  return {
    kind: 'completed',
    summary: kpiAnswered
      ? 'KPI regression identified: revenue dropped 12% due to churn'
      : 'Investigating KPI...',
    semantics: 'kpi-regression-analysis',
    confidence: kpiAnswered ? 'high' : 'med',
    sourceToolProvenance: [],
    structured: { kpiAnswered },
    circuitBreakerState: {},
    usageTotals: {
      inputTokens: 200,
      outputTokens: 100,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0.02,
    },
    ...(taintFlip ? {} : {}),
  }
}

function makeSynthesizerOutput(
  turnEndedReason: 'completed' | 'partial' = 'completed',
): SynthesizerOutput {
  return {
    shape: 'narrative',
    content: 'KPI regression analysis complete.',
    citations: [],
    confidence: 'high',
    turnEndedReason,
  }
}

function makeNoopStreamEmitter(): StreamEmitter {
  return {
    emit: vi.fn(),
    close: vi.fn(),
    error: vi.fn(),
  }
}

// ─── Test-scoped ScorerRegistry stub ─────────────────────────────────────────

/**
 * Lightweight in-memory ScorerRegistry that does not require DB or audit wiring.
 * Supports register (in-memory only) and findById.
 */
class TestScorerRegistry {
  private readonly scorers = new Map<string, SetaScorer>()

  register(scorer: SetaScorer): void {
    this.scorers.set(scorer.id, scorer)
  }

  findById(id: string): SetaScorer | undefined {
    return this.scorers.get(id)
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('IterativeOrchestrator (integration — real CompletionScorerRunner)', () => {
  let ceilingEnforcer: IterationCeilingEnforcer
  let replanner: { replan: ReturnType<typeof vi.fn> }
  let subAgentRunner: { run: ReturnType<typeof vi.fn> }
  let synthesizer: { synthesize: ReturnType<typeof vi.fn> }
  let scorerRegistry: TestScorerRegistry
  let scorerRunner: CompletionScorerRunner
  let orchestrator: IterativeOrchestrator

  beforeEach(() => {
    ceilingEnforcer = new IterationCeilingEnforcer()
    scorerRegistry = new TestScorerRegistry()
    scorerRunner = new CompletionScorerRunner(scorerRegistry as never)
    replanner = { replan: vi.fn() }
    subAgentRunner = { run: vi.fn() }
    synthesizer = { synthesize: vi.fn() }

    orchestrator = new IterativeOrchestrator(
      subAgentRunner as unknown as ISubAgentRunner,
      synthesizer as unknown as ISynthesizer,
      scorerRunner,
      ceilingEnforcer,
      replanner as unknown as IterativeRePlanner,
    )
  })

  // ── 1. Happy 3-iteration turn ─────────────────────────────────────────────────

  it('1. happy 3-iteration turn: scorer passes at iteration 3 → { kind: "synthesized" }', async () => {
    const scorer = makeKpiAnswerShapeScorer()
    scorerRegistry.register(scorer)

    const plan = makeIterativePlan(5)
    const turnState = makeTurnState()
    const emitter = makeNoopStreamEmitter()
    const abortController = new AbortController()

    // Iterations 1 and 2: KPI not yet answered
    // Iteration 3: KPI answered → scorer passes
    subAgentRunner.run
      .mockResolvedValueOnce(makeSubAgentOutput(false)) // iter 1
      .mockResolvedValueOnce(makeSubAgentOutput(false)) // iter 2
      .mockResolvedValueOnce(makeSubAgentOutput(true)) // iter 3 → passes scorer

    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: {
        sub_agent_key: 'goals.analyst',
        input: { query: 'investigate further' },
        reason: 'kpi not yet answered',
      },
    }
    replanner.replan
      .mockResolvedValueOnce(continueResult) // after iter 1
      .mockResolvedValueOnce(continueResult) // after iter 2

    const synthOutput = makeSynthesizerOutput('completed')
    synthesizer.synthesize.mockResolvedValue(synthOutput)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Why did my KPI regress?',
      turnState,
      abortSignal: abortController.signal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('synthesized')
    if (result.kind === 'synthesized') {
      expect(result.answer).toBe(synthOutput)
    }

    // Ran 3 iterations; scorer was real (not mocked)
    expect(subAgentRunner.run).toHaveBeenCalledTimes(3)
    expect(replanner.replan).toHaveBeenCalledTimes(2)
    expect(synthesizer.synthesize).toHaveBeenCalledTimes(1)
  })

  // ── 2. Max-iterations exit (10 iterations, scorer never passes) ───────────────

  it('2. max-iterations exit: 10 iterations, scorer never passes → { kind: "partial", reason: "limit_reached" }', async () => {
    const scorer = makeKpiAnswerShapeScorer()
    scorerRegistry.register(scorer)

    const plan = makeIterativePlan(10)
    const turnState = makeTurnState()
    const emitter = makeNoopStreamEmitter()
    const abortController = new AbortController()

    // All 10 iterations return kpiAnswered=false → scorer never passes
    subAgentRunner.run.mockResolvedValue(makeSubAgentOutput(false))

    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: {
        sub_agent_key: 'goals.analyst',
        input: { query: 'retry' },
        reason: 'still investigating',
      },
    }
    replanner.replan.mockResolvedValue(continueResult)

    const synthOutput = makeSynthesizerOutput('partial')
    synthesizer.synthesize.mockResolvedValue(synthOutput)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Why did my KPI regress?',
      turnState,
      abortSignal: abortController.signal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('partial')
    if (result.kind === 'partial') {
      expect(result.reason).toBe('limit_reached')
    }

    // Ran exactly 10 iterations (plan maxIterations = surface cap for global-chat)
    expect(subAgentRunner.run).toHaveBeenCalledTimes(10)
    // Replanner called 9 times (not called after final iteration when max is hit)
    expect(replanner.replan).toHaveBeenCalledTimes(9)
  })

  // ── 3. Taint persistence across iterations ────────────────────────────────────

  it('3. taint persistence: iteration 1 sets turnState.tainted.value → later SSE events report taint_at_start=true', async () => {
    const scorer = makeKpiAnswerShapeScorer()
    scorerRegistry.register(scorer)

    const plan = makeIterativePlan(3)
    const turnState = makeTurnState()
    const streamEmitter = makeNoopStreamEmitter()
    const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = []
    ;(streamEmitter.emit as ReturnType<typeof vi.fn>).mockImplementation(
      (event: { type: string; payload: Record<string, unknown> }) => {
        emittedEvents.push({ type: event.type, payload: event.payload })
      },
    )
    const abortController = new AbortController()

    // Iteration 1: not answered — side-effect: flip taint during runner execution
    subAgentRunner.run.mockImplementationOnce(async () => {
      // Simulate a taint-seed detection during sub-agent execution
      turnState.tainted.value = true
      return makeSubAgentOutput(false)
    })
    // Iteration 2: not answered
    subAgentRunner.run.mockImplementationOnce(async () => {
      return makeSubAgentOutput(false)
    })
    // Iteration 3: answered → scorer passes
    subAgentRunner.run.mockImplementationOnce(async () => {
      return makeSubAgentOutput(true)
    })

    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: {
        sub_agent_key: 'goals.analyst',
        input: {},
        reason: 'continue',
      },
    }
    replanner.replan
      .mockResolvedValueOnce(continueResult) // after iter 1
      .mockResolvedValueOnce(continueResult) // after iter 2

    const synthOutput = makeSynthesizerOutput('completed')
    synthesizer.synthesize.mockResolvedValue(synthOutput)

    await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Why did my KPI regress?',
      turnState,
      abortSignal: abortController.signal,
      streamEmitter,
    })

    // Collect all iteration.started events
    const startedEvents = emittedEvents.filter((e) => e.type === 'iteration.started')
    expect(startedEvents).toHaveLength(3)

    // Iteration 1: taint_at_start=false (taint was not yet set at start of iter 1)
    expect(startedEvents[0]!.payload['taint_at_start']).toBe(false)

    // Iterations 2 and 3: taint_at_start=true (taint was flipped during iteration 1)
    expect(startedEvents[1]!.payload['taint_at_start']).toBe(true)
    expect(startedEvents[2]!.payload['taint_at_start']).toBe(true)
  })

  // ── 4. Inline surface cap (surface='inline', plan maxIterations=10) ──────────

  it('4. inline surface: maxIterations capped at 10 even when plan specifies 10 (surface cap matches)', async () => {
    const scorer = makeKpiAnswerShapeScorer()
    scorerRegistry.register(scorer)

    // inline surface has max 10 — same as global-chat — verify cap is applied
    const plan = makeIterativePlan(10)
    const turnState = makeTurnState('inline')
    const emitter = makeNoopStreamEmitter()
    const abortController = new AbortController()

    // Scorer never passes → run up to surface cap
    subAgentRunner.run.mockResolvedValue(makeSubAgentOutput(false))

    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: { sub_agent_key: 'goals.analyst', input: {}, reason: 'continue' },
    }
    replanner.replan.mockResolvedValue(continueResult)

    const synthOutput = makeSynthesizerOutput('partial')
    synthesizer.synthesize.mockResolvedValue(synthOutput)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Inline question',
      turnState,
      abortSignal: abortController.signal,
      streamEmitter: emitter,
    })

    // Surface cap for inline is 10, plan maxIterations is 10 → effective=10
    expect(result.kind).toBe('partial')
    expect(subAgentRunner.run).toHaveBeenCalledTimes(10)
  })

  // ── 5. Unknown scorer ID: scorer not found → error result (passed=false) ─────

  it('5. unknown scorer ID: scorer not found in registry → isComplete=false (not a throw)', async () => {
    // Do NOT register any scorer
    const plan = makeIterativePlan(2, ['non-existent-scorer'])
    const turnState = makeTurnState()
    const emitter = makeNoopStreamEmitter()
    const abortController = new AbortController()

    subAgentRunner.run.mockResolvedValue(makeSubAgentOutput(false))

    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: { sub_agent_key: 'goals.analyst', input: {}, reason: 'continue' },
    }
    replanner.replan.mockResolvedValue(continueResult)

    const synthOutput = makeSynthesizerOutput('partial')
    synthesizer.synthesize.mockResolvedValue(synthOutput)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test',
      turnState,
      abortSignal: abortController.signal,
      streamEmitter: emitter,
    })

    // Runs maxIterations=2 without throwing; scorer not found → passes=false → partial
    expect(result.kind).toBe('partial')
    expect(subAgentRunner.run).toHaveBeenCalledTimes(2)
  })
})
