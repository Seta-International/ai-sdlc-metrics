/**
 * iterative-orchestrator.spec.ts — Plan 12 Task 4
 *
 * Unit tests for IterativeOrchestrator.execute().
 *
 * Coverage:
 *  1.  Happy 3-iteration path: scorer passes at iteration 3 → synthesizer runs → { kind: 'synthesized' }
 *  2.  Max iterations reached (loop hits maxIterations before scorer passes) → { kind: 'partial' }
 *  3.  Ceiling enforcer blocks before iteration 2 (cumulative_cost) → { kind: 'partial' } (no drafts)
 *  4.  Ceiling enforcer blocks with drafts present → { kind: 'aborted', reason: 'budget' }
 *  5.  Replanner returns exit(stuck) → synthesizer runs → { kind: 'partial' }
 *  6.  Replanner returns exit(disambiguation) → { kind: 'disambiguation', question: ... }
 *  7.  SSE events emitted in correct order: started → validated → ended for each iteration
 *  8.  abortSignal fired → { kind: 'aborted', reason: 'user' }
 *  9.  Surface cap clamps maxIterations (R-12.5): plan maxIterations=50 on global-chat → capped at 10
 * 10.  Replanner returns exit(complete) → synthesizer runs → { kind: 'partial' } (scorer is authoritative)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IterativeOrchestrator } from './iterative-orchestrator'
import type {
  PhaseExecutorTurnState,
  SubAgentOutput,
  SynthesizerOutput,
  DraftProposal,
} from './phase-executor-contracts'
import type { IterativePlan } from '../../domain/value-objects/router-plan-schema'
import type { StreamEmitter } from './stream-gateway'
import type { RunScorersResult } from './completion-scorer-runner'
import type { ReplanResult } from './iterative-replanner'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeIterativePlan(overrides: Partial<IterativePlan> = {}): IterativePlan {
  return {
    topology: 'iterative',
    intent_slug: 'planner.tasks',
    flow_id: '00000000-0000-0000-0000-000000000001',
    initialDirective: {
      sub_agent_key: 'planner.worker',
      input: { query: 'list overdue tasks' },
      reason: 'initial dispatch',
    },
    completionCriteria: {
      scorerIds: ['scorer-a'],
      strategy: 'all',
      maxIterations: 5,
      hintToRouter: 'all overdue tasks reviewed',
    },
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

function makeSubAgentOutput(
  kind: SubAgentOutput['kind'] = 'completed',
  drafts?: DraftProposal[],
): SubAgentOutput {
  return {
    kind,
    summary: 'found 3 tasks',
    semantics: 'overdue tasks',
    confidence: 'high',
    sourceToolProvenance: [],
    structured: { taskCount: 3 },
    circuitBreakerState: {},
    usageTotals: {
      inputTokens: 100,
      outputTokens: 50,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0.01,
    },
    drafts,
  }
}

function makeSynthesizerOutput(): SynthesizerOutput {
  return {
    shape: 'narrative',
    content: 'You have 3 overdue tasks.',
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

describe('IterativeOrchestrator', () => {
  let subAgentRunner: { run: ReturnType<typeof vi.fn> }
  let synthesizer: { synthesize: ReturnType<typeof vi.fn> }
  let completionScorerRunner: { runScorers: ReturnType<typeof vi.fn> }
  let iterationCeilingEnforcer: { checkBeforeIteration: ReturnType<typeof vi.fn> }
  let iterativeRePlanner: { replan: ReturnType<typeof vi.fn> }
  let orchestrator: IterativeOrchestrator

  beforeEach(() => {
    subAgentRunner = { run: vi.fn() }
    synthesizer = { synthesize: vi.fn() }
    completionScorerRunner = { runScorers: vi.fn() }
    iterationCeilingEnforcer = { checkBeforeIteration: vi.fn() }
    iterativeRePlanner = { replan: vi.fn() }

    orchestrator = new IterativeOrchestrator(
      subAgentRunner as never,
      synthesizer as never,
      completionScorerRunner as never,
      iterationCeilingEnforcer as never,
      iterativeRePlanner as never,
    )
  })

  // ── 1. Happy 3-iteration path ────────────────────────────────────────────────

  it('1. happy 3-iteration path: scorer passes at iteration 3 → synthesizer runs → synthesized', async () => {
    const plan = makeIterativePlan()
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const subOutput = makeSubAgentOutput()
    const synthOutput = makeSynthesizerOutput()

    // All ceiling checks pass
    iterationCeilingEnforcer.checkBeforeIteration.mockReturnValue({ allowed: true })

    // SubAgent returns output on all 3 calls
    subAgentRunner.run.mockResolvedValue(subOutput)

    // Scorer passes only at iteration 3
    const failResult: RunScorersResult = {
      isComplete: false,
      results: [{ score: 0, passed: false, reason: 'not yet' }],
    }
    const passResult: RunScorersResult = {
      isComplete: true,
      results: [{ score: 1, passed: true, reason: 'done' }],
    }
    completionScorerRunner.runScorers
      .mockResolvedValueOnce(failResult) // iteration 1
      .mockResolvedValueOnce(failResult) // iteration 2
      .mockResolvedValueOnce(passResult) // iteration 3

    // Replanner continues iterations 1 and 2
    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: {
        sub_agent_key: 'planner.worker',
        input: { query: 'next iteration' },
        reason: 'scorer not passed',
      },
    }
    iterativeRePlanner.replan
      .mockResolvedValueOnce(continueResult) // after iter 1
      .mockResolvedValueOnce(continueResult) // after iter 2

    // Synthesizer returns output
    synthesizer.synthesize.mockResolvedValue(synthOutput)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'list overdue tasks',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('synthesized')
    if (result.kind === 'synthesized') {
      expect(result.answer).toBe(synthOutput)
    }

    // SubAgent runner called 3 times
    expect(subAgentRunner.run).toHaveBeenCalledTimes(3)

    // Scorer called 3 times
    expect(completionScorerRunner.runScorers).toHaveBeenCalledTimes(3)

    // Replanner called 2 times (not called after iteration 3 since scorer passed)
    expect(iterativeRePlanner.replan).toHaveBeenCalledTimes(2)

    // Synthesizer called once
    expect(synthesizer.synthesize).toHaveBeenCalledTimes(1)
  })

  // ── 2. Max iterations reached ────────────────────────────────────────────────

  it('2. max iterations reached before scorer passes → partial', async () => {
    const plan = makeIterativePlan({
      completionCriteria: {
        scorerIds: ['scorer-a'],
        strategy: 'all',
        maxIterations: 2,
        hintToRouter: 'done',
      },
    })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const subOutput = makeSubAgentOutput()
    const synthOutput: SynthesizerOutput = {
      ...makeSynthesizerOutput(),
      turnEndedReason: 'partial',
    }

    iterationCeilingEnforcer.checkBeforeIteration.mockReturnValue({ allowed: true })
    subAgentRunner.run.mockResolvedValue(subOutput)

    const failResult: RunScorersResult = {
      isComplete: false,
      results: [{ score: 0, passed: false, reason: 'not done' }],
    }
    completionScorerRunner.runScorers.mockResolvedValue(failResult)

    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: {
        sub_agent_key: 'planner.worker',
        input: {},
        reason: 'continue',
      },
    }
    iterativeRePlanner.replan.mockResolvedValue(continueResult)

    synthesizer.synthesize.mockResolvedValue(synthOutput)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test utterance',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('partial')
    if (result.kind === 'partial') {
      expect(result.reason).toBe('limit_reached')
    }
    expect(subAgentRunner.run).toHaveBeenCalledTimes(2)
  })

  // ── 3. Ceiling enforcer blocks before iteration 2 (no drafts) ───────────────

  it('3. ceiling enforcer blocks cumulative_cost before iteration 2 (no drafts) → partial', async () => {
    const plan = makeIterativePlan()
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const subOutput = makeSubAgentOutput('completed', undefined) // no drafts
    const synthOutput: SynthesizerOutput = {
      ...makeSynthesizerOutput(),
      turnEndedReason: 'partial',
    }

    // First iteration allowed, second blocked
    iterationCeilingEnforcer.checkBeforeIteration
      .mockReturnValueOnce({ allowed: true })
      .mockReturnValueOnce({ allowed: false, reason: 'cumulative_cost' as const })

    subAgentRunner.run.mockResolvedValue(subOutput)

    const failResult: RunScorersResult = {
      isComplete: false,
      results: [{ score: 0, passed: false, reason: 'not done' }],
    }
    completionScorerRunner.runScorers.mockResolvedValue(failResult)

    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: { sub_agent_key: 'planner.worker', input: {}, reason: 'continue' },
    }
    iterativeRePlanner.replan.mockResolvedValue(continueResult)

    synthesizer.synthesize.mockResolvedValue(synthOutput)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test utterance',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('partial')
    if (result.kind === 'partial') {
      expect(result.reason).toBe('limit_reached')
    }
    // Only one sub-agent run (iteration 2 was blocked)
    expect(subAgentRunner.run).toHaveBeenCalledTimes(1)
  })

  // ── 4. Ceiling enforcer blocks with drafts → aborted(budget) ────────────────

  it('4. ceiling enforcer blocks with drafts present → aborted reason=budget', async () => {
    const plan = makeIterativePlan()
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const draft: DraftProposal = { id: 'draft-1', toolName: 'planner.createTask', args: {} }
    const subOutputWithDrafts = makeSubAgentOutput('completed', [draft])

    // First iteration allowed, second blocked
    iterationCeilingEnforcer.checkBeforeIteration
      .mockReturnValueOnce({ allowed: true })
      .mockReturnValueOnce({ allowed: false, reason: 'cumulative_cost' as const })

    subAgentRunner.run.mockResolvedValue(subOutputWithDrafts)

    const failResult: RunScorersResult = {
      isComplete: false,
      results: [{ score: 0, passed: false, reason: 'not done' }],
    }
    completionScorerRunner.runScorers.mockResolvedValue(failResult)

    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: { sub_agent_key: 'planner.worker', input: {}, reason: 'continue' },
    }
    iterativeRePlanner.replan.mockResolvedValue(continueResult)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test utterance',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('aborted')
    if (result.kind === 'aborted') {
      expect(result.reason).toBe('budget')
    }
    // Synthesizer NOT called
    expect(synthesizer.synthesize).not.toHaveBeenCalled()
  })

  // ── 5. Replanner returns exit(stuck) → synthesizer → partial ────────────────

  it('5. replanner returns exit(stuck) → synthesizer runs → partial', async () => {
    const plan = makeIterativePlan()
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const subOutput = makeSubAgentOutput()
    const synthOutput: SynthesizerOutput = {
      ...makeSynthesizerOutput(),
      turnEndedReason: 'partial',
    }

    iterationCeilingEnforcer.checkBeforeIteration.mockReturnValue({ allowed: true })
    subAgentRunner.run.mockResolvedValue(subOutput)

    const failResult: RunScorersResult = {
      isComplete: false,
      results: [{ score: 0, passed: false, reason: 'not done' }],
    }
    completionScorerRunner.runScorers.mockResolvedValue(failResult)

    const stuckResult: ReplanResult = { kind: 'exit', reason: 'stuck' }
    iterativeRePlanner.replan.mockResolvedValue(stuckResult)

    synthesizer.synthesize.mockResolvedValue(synthOutput)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test utterance',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('partial')
    if (result.kind === 'partial') {
      expect(result.reason).toBe('limit_reached')
    }
    expect(synthesizer.synthesize).toHaveBeenCalledTimes(1)
  })

  // ── 6. Replanner returns exit(disambiguation) ────────────────────────────────

  it('6. replanner returns exit(disambiguation) → disambiguation result', async () => {
    const plan = makeIterativePlan()
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const subOutput = makeSubAgentOutput()

    iterationCeilingEnforcer.checkBeforeIteration.mockReturnValue({ allowed: true })
    subAgentRunner.run.mockResolvedValue(subOutput)

    const failResult: RunScorersResult = {
      isComplete: false,
      results: [{ score: 0, passed: false, reason: 'not done' }],
    }
    completionScorerRunner.runScorers.mockResolvedValue(failResult)

    const disambiguationResult: ReplanResult = {
      kind: 'exit',
      reason: 'disambiguation',
      disambiguationQuestion: 'Which project do you mean?',
    }
    iterativeRePlanner.replan.mockResolvedValue(disambiguationResult)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test utterance',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('disambiguation')
    if (result.kind === 'disambiguation') {
      expect(result.question).toBe('Which project do you mean?')
    }
    // Synthesizer NOT called
    expect(synthesizer.synthesize).not.toHaveBeenCalled()
  })

  // ── 7. SSE events emitted in correct order ───────────────────────────────────

  it('7. SSE events emitted in correct order: started → validated → ended per iteration', async () => {
    const plan = makeIterativePlan({
      completionCriteria: {
        scorerIds: ['scorer-a'],
        strategy: 'all',
        maxIterations: 2,
        hintToRouter: 'done',
      },
    })
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const subOutput = makeSubAgentOutput()
    const synthOutput = makeSynthesizerOutput()

    iterationCeilingEnforcer.checkBeforeIteration.mockReturnValue({ allowed: true })
    subAgentRunner.run.mockResolvedValue(subOutput)

    const failResult: RunScorersResult = {
      isComplete: false,
      results: [{ score: 0, passed: false }],
    }
    const passResult: RunScorersResult = {
      isComplete: true,
      results: [{ score: 1, passed: true }],
    }
    completionScorerRunner.runScorers
      .mockResolvedValueOnce(failResult)
      .mockResolvedValueOnce(passResult)

    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: { sub_agent_key: 'planner.worker', input: {}, reason: 'continue' },
    }
    iterativeRePlanner.replan.mockResolvedValueOnce(continueResult)

    synthesizer.synthesize.mockResolvedValue(synthOutput)

    await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test utterance',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    const types = emitter.emittedEvents.map((e) => e.type)

    // Iteration 1: started → validated → ended
    expect(types[0]).toBe('iteration.started')
    expect(types[1]).toBe('iteration.validated')
    expect(types[2]).toBe('iteration.ended')
    // Iteration 2: started → validated → ended
    expect(types[3]).toBe('iteration.started')
    expect(types[4]).toBe('iteration.validated')
    expect(types[5]).toBe('iteration.ended')

    // Verify payloads
    const iter1Started = emitter.emittedEvents[0]!.payload as Record<string, unknown>
    expect(iter1Started['n']).toBe(1)
    expect(iter1Started['sub_agent_domain']).toBeDefined()

    const iter1Validated = emitter.emittedEvents[1]!.payload as Record<string, unknown>
    expect(iter1Validated['n']).toBe(1)
    expect(iter1Validated['passed']).toBe(false)

    const iter1Ended = emitter.emittedEvents[2]!.payload as Record<string, unknown>
    expect(iter1Ended['n']).toBe(1)
  })

  // ── 8. abortSignal fired → aborted(user) ────────────────────────────────────

  it('8. abortSignal fired before first iteration → aborted reason=user', async () => {
    const plan = makeIterativePlan()
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()

    const controller = new AbortController()
    controller.abort()
    const abortSignal = controller.signal

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test utterance',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('aborted')
    if (result.kind === 'aborted') {
      expect(result.reason).toBe('user')
    }
    // Nothing should have been called
    expect(subAgentRunner.run).not.toHaveBeenCalled()
  })

  // ── 9. Surface cap clamps maxIterations (R-12.5) ────────────────────────────
  // Verify the last ceiling check received maxIterations=10, not 50 (from plan with maxIterations: 50).

  it('9. surface cap: plan maxIterations=50 on global-chat surface → capped at 10', async () => {
    const plan = makeIterativePlan({
      completionCriteria: {
        scorerIds: ['scorer-a'],
        strategy: 'all',
        maxIterations: 50,
        hintToRouter: 'all tasks reviewed',
      },
    })
    const turnState = makeTurnState({ surface: 'global-chat' })
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const subOutput = makeSubAgentOutput()
    const synthOutput: SynthesizerOutput = {
      ...makeSynthesizerOutput(),
      turnEndedReason: 'partial',
    }

    // All ceiling checks pass until the orchestrator stops itself at the surface cap
    iterationCeilingEnforcer.checkBeforeIteration.mockReturnValue({ allowed: true })
    subAgentRunner.run.mockResolvedValue(subOutput)

    // Scorer never passes
    const failResult: RunScorersResult = {
      isComplete: false,
      results: [{ score: 0, passed: false, reason: 'not done' }],
    }
    completionScorerRunner.runScorers.mockResolvedValue(failResult)

    // Replanner always says continue
    const continueResult: ReplanResult = {
      kind: 'continue',
      nextDirective: { sub_agent_key: 'planner.worker', input: {}, reason: 'continue' },
    }
    iterativeRePlanner.replan.mockResolvedValue(continueResult)

    synthesizer.synthesize.mockResolvedValue(synthOutput)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test utterance',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    // Should stop at 10 iterations (surface cap), not 50 (plan maxIterations)
    expect(subAgentRunner.run).toHaveBeenCalledTimes(10)
    expect(result.kind).toBe('partial')
    if (result.kind === 'partial') {
      expect(result.reason).toBe('limit_reached')
    }

    // The last ceiling check should have been passed effectiveMaxIterations=10,
    // so the loop breaks at n=10 before calling the runner an 11th time.
    // Verify the ceiling enforcer received maxIterations=10, not 50 (from plan with maxIterations: 50).
    const lastCeilingCall =
      iterationCeilingEnforcer.checkBeforeIteration.mock.calls[
        iterationCeilingEnforcer.checkBeforeIteration.mock.calls.length - 1
      ]
    expect(lastCeilingCall[0].maxIterations).toBe(10)
  })

  it('8b. abortSignal fired after first iteration starts → aborted reason=user', async () => {
    const plan = makeIterativePlan()
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const controller = new AbortController()
    const abortSignal = controller.signal

    iterationCeilingEnforcer.checkBeforeIteration.mockReturnValue({ allowed: true })

    // Abort mid-execution inside SubAgentRunner.run()
    subAgentRunner.run.mockImplementation(async () => {
      controller.abort()
      return makeSubAgentOutput()
    })

    completionScorerRunner.runScorers.mockResolvedValue({
      isComplete: false,
      results: [{ score: 0, passed: false }],
    })

    iterativeRePlanner.replan.mockResolvedValue({
      kind: 'continue',
      nextDirective: { sub_agent_key: 'planner.worker', input: {}, reason: 'continue' },
    })

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test utterance',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    expect(result.kind).toBe('aborted')
    if (result.kind === 'aborted') {
      expect(result.reason).toBe('user')
    }
  })

  // ── 10. Replanner exit(complete) → partial (scorer is authoritative) ─────────

  it('10. replanner exit(complete) → synthesizer runs → partial (scorer is authoritative for completion)', async () => {
    // exit(complete) from replanner means "no more useful iterations", NOT "task succeeded".
    // wasCompleted is determined by the scorer, not the replanner exit reason.
    const plan = makeIterativePlan()
    const turnState = makeTurnState()
    const emitter = makeStreamEmitter()
    const abortSignal = new AbortController().signal

    const subOutput = makeSubAgentOutput()
    const synthOutput: SynthesizerOutput = {
      ...makeSynthesizerOutput(),
      turnEndedReason: 'partial',
    }

    iterationCeilingEnforcer.checkBeforeIteration.mockReturnValue({ allowed: true })
    subAgentRunner.run.mockResolvedValue(subOutput)

    // Scorer never passes → wasCompleted will be false
    const failResult: RunScorersResult = {
      isComplete: false,
      results: [{ score: 0, passed: false, reason: 'not done' }],
    }
    completionScorerRunner.runScorers.mockResolvedValue(failResult)

    // Replanner signals exit(complete) after one iteration
    const completeExitResult: ReplanResult = { kind: 'exit', reason: 'complete' }
    iterativeRePlanner.replan.mockResolvedValue(completeExitResult)

    synthesizer.synthesize.mockResolvedValue(synthOutput)

    const result = await orchestrator.execute({
      initialPlan: plan,
      userUtterance: 'Test utterance',
      turnState,
      abortSignal,
      streamEmitter: emitter,
    })

    // Replanner exit(complete) should NOT produce { kind: 'synthesized' }
    // because the scorer never confirmed completion — result is partial
    expect(result.kind).toBe('partial')
    if (result.kind === 'partial') {
      expect(result.reason).toBe('limit_reached')
    }
    expect(synthesizer.synthesize).toHaveBeenCalledTimes(1)
    // Replanner was called once (after iteration 1)
    expect(iterativeRePlanner.replan).toHaveBeenCalledTimes(1)
  })
})
