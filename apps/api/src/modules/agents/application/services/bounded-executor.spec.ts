/**
 * bounded-executor.spec.ts — Plan 18 Task 5
 *
 * Unit tests for BoundedExecutor.execute().
 *
 * Coverage:
 *   1. Happy path: sequential phase-1 fan-out + synthesizer → 'synthesized'
 *   2. Emits phase.started for phase-1
 *   3. Pre-aborted signal → 'aborted', subAgentRunner.run not called
 *   4. Mid-loop abort: runner mock aborts after first directive; synthesizer not called
 *   5. Suppress-partial: ceiling-hit + drafts → 'synthesized' suppressed narrative; synthesizer NOT called
 *   6. Surface-partial: ceiling-hit + zero drafts → 'partial'; synthesizer called
 *   7. Phase-2 path: emits both phase.started events, calls runner with phase: 2,
 *      observes turnState.phaseContextNote === undefined when no cbState
 *   8. Phase-2 with cbState: phaseContextNote populated and matches /tool-x/ during phase-2 dispatch
 *   9. Synthesizer receives a single `outputs` map (no legacy phase1Outputs/phase2Outputs)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BoundedExecutor } from './bounded-executor'
import * as pipelineMetrics from '../../infrastructure/observability/pipeline-metrics'
import type {
  PhaseExecutorTurnState,
  SubAgentOutput,
  SynthesizerOutput,
  DraftProposal,
} from './phase-executor-contracts'
import type { BoundedPlan, SubAgentDirective } from '../../domain/value-objects/router-plan-schema'
import type { StreamEmitter } from './stream-gateway'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDirective(key: string, overrides: Partial<SubAgentDirective> = {}): SubAgentDirective {
  return {
    sub_agent_key: key,
    input: { q: `query for ${key}` },
    reason: `dispatch ${key}`,
    ...overrides,
  }
}

function makeBoundedPlan(overrides: Partial<BoundedPlan> = {}): BoundedPlan {
  return {
    topology: 'bounded',
    intent_slug: 'people.profile',
    flow_id: '00000000-0000-0000-0000-000000000001',
    phase1: [makeDirective('a'), makeDirective('b')],
    phase2: [],
    ...overrides,
  }
}

function makeTurnState(overrides: Partial<PhaseExecutorTurnState> = {}): PhaseExecutorTurnState {
  return {
    traceId: 'trace-001',
    tenantId: 'tenant-abc',
    userId: 'user-xyz',
    conversationId: 'conv-111',
    sessionId: 'sess-222',
    surface: 'global-chat',
    tainted: { value: false },
    routerReplanCount: 0,
    ...overrides,
  }
}

function makeSubAgentOutput(overrides: Partial<SubAgentOutput> = {}): SubAgentOutput {
  return {
    kind: 'completed',
    summary: 'sub-agent summary',
    semantics: 'sub-agent semantics',
    confidence: 'high',
    sourceToolProvenance: [],
    structured: {},
    circuitBreakerState: {},
    usageTotals: {
      inputTokens: 10,
      outputTokens: 5,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0.001,
    },
    ...overrides,
  }
}

function makeSynthesizerOutput(): SynthesizerOutput {
  return {
    shape: 'narrative',
    content: 'synthesized answer',
    citations: [],
    confidence: 'high',
    turnEndedReason: 'completed',
  }
}

function makeStreamEmitter(): StreamEmitter & {
  emittedEvents: Array<{ type: string; payload: unknown }>
} {
  const emittedEvents: Array<{ type: string; payload: unknown }> = []
  return {
    emittedEvents,
    emit: vi.fn((event) => {
      emittedEvents.push({ type: event.type, payload: event.payload })
    }),
    close: vi.fn(),
    error: vi.fn(),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BoundedExecutor', () => {
  let subAgentRunner: { run: ReturnType<typeof vi.fn> }
  let synthesizer: { synthesize: ReturnType<typeof vi.fn> }
  let executor: BoundedExecutor

  beforeEach(() => {
    subAgentRunner = { run: vi.fn() }
    synthesizer = { synthesize: vi.fn() }
    executor = new BoundedExecutor(subAgentRunner as never, synthesizer as never)
  })

  // ── 1. Happy path ──────────────────────────────────────────────────────────

  it('1. dispatches phase-1 sequentially then synthesizes', async () => {
    const plan = makeBoundedPlan()
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const calls: string[] = []
    subAgentRunner.run.mockImplementation(async (opts: { directive: SubAgentDirective }) => {
      calls.push(opts.directive.sub_agent_key)
      return makeSubAgentOutput()
    })
    synthesizer.synthesize.mockResolvedValue(makeSynthesizerOutput())

    const result = await executor.execute({
      plan,
      userUtterance: 'hello',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('synthesized')
    expect(calls).toEqual(['a', 'b'])
    expect(subAgentRunner.run).toHaveBeenCalledTimes(2)
    expect(synthesizer.synthesize).toHaveBeenCalledTimes(1)
  })

  // ── 2. Emits phase.started for phase-1 ─────────────────────────────────────

  it('2. emits phase.started for phase-1', async () => {
    const plan = makeBoundedPlan({ phase1: [makeDirective('a')] })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    subAgentRunner.run.mockResolvedValue(makeSubAgentOutput())
    synthesizer.synthesize.mockResolvedValue(makeSynthesizerOutput())

    await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    const phaseEvents = emitter.emittedEvents.filter((e) => e.type === 'phase.started')
    expect(phaseEvents).toHaveLength(1)
    expect(phaseEvents[0]!.payload).toEqual({ phase: 'phase-1' })
  })

  // ── 3. Pre-aborted signal ──────────────────────────────────────────────────

  it('3. pre-aborted signal returns aborted without dispatching', async () => {
    const plan = makeBoundedPlan()
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const ctrl = new AbortController()
    ctrl.abort()

    const result = await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal: ctrl.signal,
      streamEmitter: emitter,
    })

    expect(result).toEqual({ kind: 'aborted', reason: 'user' })
    expect(subAgentRunner.run).not.toHaveBeenCalled()
    expect(synthesizer.synthesize).not.toHaveBeenCalled()
  })

  // ── 4. Mid-loop abort ──────────────────────────────────────────────────────

  it('4. mid-loop abort: runner aborts after first; synthesizer not called', async () => {
    const plan = makeBoundedPlan({
      phase1: [makeDirective('a'), makeDirective('b'), makeDirective('c')],
    })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const ctrl = new AbortController()

    let calledTimes = 0
    subAgentRunner.run.mockImplementation(async () => {
      calledTimes++
      if (calledTimes === 1) {
        ctrl.abort()
      }
      return makeSubAgentOutput()
    })

    const result = await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal: ctrl.signal,
      streamEmitter: emitter,
    })

    expect(result).toEqual({ kind: 'aborted', reason: 'user' })
    expect(subAgentRunner.run).toHaveBeenCalledTimes(1)
    expect(synthesizer.synthesize).not.toHaveBeenCalled()
  })

  // ── 5. Suppress-partial ────────────────────────────────────────────────────

  it('5. suppress-partial: ceiling-hit + drafts → synthesized suppressed; synthesizer NOT called', async () => {
    const plan = makeBoundedPlan({ phase1: [makeDirective('a'), makeDirective('b')] })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const draft: DraftProposal = { id: 'd1', toolName: 'tool.create', args: {} }
    subAgentRunner.run
      .mockResolvedValueOnce(makeSubAgentOutput({ kind: 'ceiling_hit' }))
      .mockResolvedValueOnce(makeSubAgentOutput({ drafts: [draft] }))

    const result = await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('synthesized')
    if (result.kind !== 'synthesized') throw new Error('unreachable')
    expect(result.drafts).toEqual([draft])
    expect(result.answer.shape).toBe('narrative')
    expect(synthesizer.synthesize).not.toHaveBeenCalled()
  })

  // ── 6. Surface-partial ─────────────────────────────────────────────────────

  it('6. surface-partial: ceiling-hit + zero drafts → partial; synthesizer called', async () => {
    const plan = makeBoundedPlan({ phase1: [makeDirective('a')] })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    subAgentRunner.run.mockResolvedValueOnce(makeSubAgentOutput({ kind: 'ceiling_hit' }))
    synthesizer.synthesize.mockResolvedValue(makeSynthesizerOutput())

    const result = await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('partial')
    if (result.kind !== 'partial') throw new Error('unreachable')
    expect(result.reason).toBe('limit_reached')
    expect(synthesizer.synthesize).toHaveBeenCalledTimes(1)
  })

  // ── 7. Phase-2 path (no cbState) ───────────────────────────────────────────

  it('7. phase-2 path: emits both phase.started; calls runner with phase: 2; phaseContextNote undefined when no cbState', async () => {
    const plan = makeBoundedPlan({
      phase1: [makeDirective('a')],
      phase2: [makeDirective('z')],
    })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const observedPhases: Array<{ key: string; phase: 1 | 2; note: string | undefined }> = []
    subAgentRunner.run.mockImplementation(
      async (opts: {
        directive: SubAgentDirective
        phase: 1 | 2
        turnState: PhaseExecutorTurnState
      }) => {
        observedPhases.push({
          key: opts.directive.sub_agent_key,
          phase: opts.phase,
          note: opts.turnState.phaseContextNote,
        })
        return makeSubAgentOutput()
      },
    )
    synthesizer.synthesize.mockResolvedValue(makeSynthesizerOutput())

    await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(observedPhases).toEqual([
      { key: 'a', phase: 1, note: undefined },
      { key: 'z', phase: 2, note: undefined },
    ])

    const phaseEvents = emitter.emittedEvents.filter((e) => e.type === 'phase.started')
    expect(phaseEvents.map((e) => e.payload)).toEqual([{ phase: 'phase-1' }, { phase: 'phase-2' }])

    // Cleared after phase-2 completes
    expect(turnState.phaseContextNote).toBeUndefined()
  })

  // ── 8. Phase-2 with circuit-breaker state ──────────────────────────────────

  it('8. phase-2 with cbState: phaseContextNote populated and matches /tool-x/ during phase-2 dispatch', async () => {
    const plan = makeBoundedPlan({
      phase1: [makeDirective('a')],
      phase2: [makeDirective('z')],
    })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const observedNotes: Array<string | undefined> = []
    subAgentRunner.run.mockImplementation(
      async (opts: {
        directive: SubAgentDirective
        phase: 1 | 2
        turnState: PhaseExecutorTurnState
      }) => {
        observedNotes.push(opts.turnState.phaseContextNote)
        if (opts.phase === 1) {
          return makeSubAgentOutput({
            circuitBreakerState: {
              'tool-x': { disabled: true, reason: 'three failures' },
            },
          })
        }
        return makeSubAgentOutput()
      },
    )
    synthesizer.synthesize.mockResolvedValue(makeSynthesizerOutput())

    await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(observedNotes[0]).toBeUndefined()
    expect(observedNotes[1]).toBeDefined()
    expect(observedNotes[1]).toMatch(/tool-x/)
    expect(turnState.phaseContextNote).toBeUndefined()
  })

  // ── 9. Synthesizer receives a single outputs map ───────────────────────────

  it('9. synthesizer receives a single `outputs` map covering both phases', async () => {
    const plan = makeBoundedPlan({
      phase1: [makeDirective('a')],
      phase2: [makeDirective('z')],
    })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    subAgentRunner.run.mockImplementation(async (opts: { directive: SubAgentDirective }) =>
      makeSubAgentOutput({ summary: `summary-${opts.directive.sub_agent_key}` }),
    )
    synthesizer.synthesize.mockResolvedValue(makeSynthesizerOutput())

    await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(synthesizer.synthesize).toHaveBeenCalledTimes(1)
    const synthOpts = synthesizer.synthesize.mock.calls[0]![0] as {
      outputs: Map<string, SubAgentOutput>
      directive: BoundedPlan
      streamEmitter: StreamEmitter
    }
    expect(synthOpts.outputs).toBeInstanceOf(Map)
    expect([...synthOpts.outputs.keys()].sort()).toEqual(['a', 'z'])
    expect(synthOpts.directive).toBe(plan)
    expect(synthOpts.streamEmitter).toBe(emitter)
    // No legacy keys
    expect(synthOpts).not.toHaveProperty('phase1Outputs')
    expect(synthOpts).not.toHaveProperty('phase2Outputs')
  })

  // ── 10. OTel: phase-1 duration emitted with outcome=completed ──────────────

  it('10. emits phase-1 duration with outcome=completed on happy path', async () => {
    const phaseSpy = vi
      .spyOn(pipelineMetrics, 'recordBoundedExecutorPhaseDuration')
      .mockImplementation(() => {})

    const plan = makeBoundedPlan({ phase1: [makeDirective('a')] })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    subAgentRunner.run.mockResolvedValue(makeSubAgentOutput())
    synthesizer.synthesize.mockResolvedValue(makeSynthesizerOutput())

    await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    const phase1Calls = phaseSpy.mock.calls.filter(([arg]) => arg.phase === 'phase-1')
    expect(phase1Calls).toHaveLength(1)
    expect(phase1Calls[0]![0].outcome).toBe('completed')
    expect(phase1Calls[0]![0].durationMs).toBeGreaterThanOrEqual(0)

    phaseSpy.mockRestore()
  })

  // ── 11. OTel: phase-1 duration emitted with outcome=cancelled on abort ─────

  it('11. emits phase-1 duration with outcome=cancelled when aborted mid-loop', async () => {
    const phaseSpy = vi
      .spyOn(pipelineMetrics, 'recordBoundedExecutorPhaseDuration')
      .mockImplementation(() => {})

    const plan = makeBoundedPlan({
      phase1: [makeDirective('a'), makeDirective('b'), makeDirective('c')],
    })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const ctrl = new AbortController()

    let calledTimes = 0
    subAgentRunner.run.mockImplementation(async () => {
      calledTimes++
      if (calledTimes === 1) {
        ctrl.abort()
      }
      return makeSubAgentOutput()
    })

    await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal: ctrl.signal,
      streamEmitter: emitter,
    })

    const phase1Calls = phaseSpy.mock.calls.filter(([arg]) => arg.phase === 'phase-1')
    expect(phase1Calls).toHaveLength(1)
    expect(phase1Calls[0]![0].outcome).toBe('cancelled')

    phaseSpy.mockRestore()
  })

  // ── 12. OTel: drafts counter called when sub-agent returns drafts ──────────

  it('12. emits drafts counter when a sub-agent returns drafts', async () => {
    const draftsSpy = vi
      .spyOn(pipelineMetrics, 'recordBoundedExecutorDrafts')
      .mockImplementation(() => {})

    const plan = makeBoundedPlan({ phase1: [makeDirective('a'), makeDirective('b')] })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const drafts: DraftProposal[] = [
      { id: 'd1', toolName: 'tool.create', args: {} },
      { id: 'd2', toolName: 'tool.update', args: {} },
    ]
    subAgentRunner.run
      .mockResolvedValueOnce(makeSubAgentOutput({ drafts }))
      .mockResolvedValueOnce(makeSubAgentOutput()) // no drafts → no-op
    synthesizer.synthesize.mockResolvedValue(makeSynthesizerOutput())

    await executor.execute({
      plan,
      userUtterance: 'q',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(draftsSpy).toHaveBeenCalledTimes(1)
    expect(draftsSpy).toHaveBeenCalledWith({
      phase: 'phase-1',
      subAgentKey: 'a',
      count: 2,
    })

    draftsSpy.mockRestore()
  })
})
