/**
 * IterativeOrchestrator — Plan 12 §4 "Main loop executor"
 *
 * Drives the iterative supervisor loop for Tier-2 (iterative topology) plans.
 *
 * Algorithm (plan 12 §5):
 *   1. Set iterationNumber = 1
 *   2. Loop:
 *      a. Check abort signal — exit aborted(user) if fired
 *      b. CeilingEnforcer.checkBeforeIteration() — exit with partial if blocked
 *      c. Emit SSE: iteration.started
 *      d. SubAgentRunner.run() with current directive
 *      e. Collect SubAgentOutput; push to iterationHistory
 *      f. Update cumulativeCostUsd + cumulativeWallclockMs
 *      g. CompletionScorerRunner.runScorers() against iteration output
 *      h. Emit SSE: iteration.validated
 *      i. Emit SSE: iteration.ended
 *      j. Check abort signal again after SSE emissions
 *      k. If isComplete OR iterationNumber >= maxIterations → break
 *      l. IterativeRePlanner.replan():
 *         - continue → increment iterationNumber, use nextDirective, loop
 *         - exit(disambiguation) → return disambiguation result
 *         - exit(stuck|complete) → break (go to post-loop synthesizer)
 *   3. Post-loop: Synthesizer.synthesize() with ALL iteration outputs
 *   4. Return PhaseExecutionResult
 */

import { Injectable, Inject } from '@nestjs/common'
import type {
  PhaseExecutorTurnState,
  PhaseExecutionResult,
  SubAgentOutput,
  SubAgentRunnerOpts,
  SynthesizerOpts,
  IterationRecord,
  DraftProposal,
} from './phase-executor-contracts'
import type {
  IterativePlan,
  SubAgentDirective,
} from '../../domain/value-objects/router-plan-schema'
import type { StreamEmitter } from './stream-gateway'
import { IterationCeilingEnforcer } from './iteration-ceiling-enforcer'
import { CompletionScorerRunner } from './completion-scorer-runner'
import { IterativeRePlanner } from './iterative-replanner'
import {
  recordIterativeTurnTotal,
  recordIterationCountExceeded,
  recordIterationsTotalHistogram,
} from '../../infrastructure/observability/gateway-metrics'

// ─── Surface-specific iteration caps (R-12.5) ────────────────────────────────

/**
 * Hard ceiling on iterations per surface type.
 * Async surfaces get more room; interactive surfaces are capped tightly.
 */
const SURFACE_MAX_ITERATIONS: Record<PhaseExecutorTurnState['surface'], number> = {
  'global-chat': 10,
  inline: 10,
  async: 20,
}

// ─── Runner / Synthesizer interface types ─────────────────────────────────────

/**
 * Subset of SubAgentRunnerOpts used by IterativeOrchestrator.
 * Config resolution is the runner's responsibility — the orchestrator does not own it.
 */
export type IterativeSubAgentRunOpts = Omit<SubAgentRunnerOpts, 'config'>

/**
 * Thin interface for the sub-agent runner, decoupled from the full ReAct loop.
 * Implemented by SubAgentRunner (pure function wrapper) or mocked in tests.
 */
export interface ISubAgentRunner {
  run(opts: IterativeSubAgentRunOpts): Promise<SubAgentOutput>
}

/**
 * Thin interface for the synthesizer, decoupled from LLM details.
 * Implemented by the Synthesizer service or mocked in tests.
 */
export interface ISynthesizer {
  synthesize(opts: SynthesizerOpts): Promise<import('./phase-executor-contracts').SynthesizerOutput>
}

// ─── DI tokens ────────────────────────────────────────────────────────────────

export const ITERATIVE_ORCHESTRATOR = Symbol('ITERATIVE_ORCHESTRATOR')
export const I_SUB_AGENT_RUNNER = Symbol('I_SUB_AGENT_RUNNER')
export const I_SYNTHESIZER = Symbol('I_SYNTHESIZER')

// ─── Default config ───────────────────────────────────────────────────────────

const DEFAULT_TOTAL_COST_BUDGET_USD = 5.0
const DEFAULT_TOTAL_WALLCLOCK_BUDGET_MS = 60_000

// ─── Execute opts ─────────────────────────────────────────────────────────────

export interface IterativeOrchestratorOpts {
  readonly initialPlan: IterativePlan
  readonly userUtterance: string
  readonly turnState: PhaseExecutorTurnState
  readonly abortSignal: AbortSignal
  readonly streamEmitter: StreamEmitter
}

// ─── IterativeOrchestrator ────────────────────────────────────────────────────

@Injectable()
export class IterativeOrchestrator {
  constructor(
    @Inject(I_SUB_AGENT_RUNNER) private readonly subAgentRunner: ISubAgentRunner,
    @Inject(I_SYNTHESIZER) private readonly synthesizer: ISynthesizer,
    private readonly completionScorerRunner: CompletionScorerRunner,
    private readonly ceilingEnforcer: IterationCeilingEnforcer,
    private readonly replanner: IterativeRePlanner,
  ) {}

  async execute(opts: IterativeOrchestratorOpts): Promise<PhaseExecutionResult> {
    const { initialPlan, userUtterance, turnState, abortSignal, streamEmitter } = opts
    const { completionCriteria, initialDirective } = initialPlan

    // ── Guard: abort signal already fired ─────────────────────────────────────
    if (abortSignal.aborted) {
      const result: PhaseExecutionResult = { kind: 'aborted', reason: 'user' }
      this._recordTurnMetrics(turnState.tenantId, result, [])
      return result
    }

    // ── Surface-specific iteration cap (R-12.5) ───────────────────────────────
    const surfaceCap = SURFACE_MAX_ITERATIONS[turnState.surface]
    const effectiveMaxIterations = Math.min(completionCriteria.maxIterations, surfaceCap)

    // ── Initialise iterative turn state ───────────────────────────────────────
    turnState.iterationNumber = 1
    turnState.completionCriteria = completionCriteria
    turnState.iterationHistory = []
    turnState.cumulativeCostUsd = 0
    turnState.cumulativeWallclockMs = 0

    const iterationHistory: IterationRecord[] = []
    // Track all outputs for synthesizer (keyed by iteration number for uniqueness)
    const allOutputs = new Map<string, SubAgentOutput>()

    let currentDirective: SubAgentDirective = initialDirective
    // Track whether the loop exited due to max iterations being reached
    let maxIterationsBreached = false

    // ── Main loop ─────────────────────────────────────────────────────────────
    for (;;) {
      const n: number = turnState.iterationNumber!

      // Step (a): Check abort signal
      if (abortSignal.aborted) {
        const result: PhaseExecutionResult = { kind: 'aborted', reason: 'user' }
        this._recordTurnMetrics(turnState.tenantId, result, iterationHistory)
        return result
      }

      // Step (b): Ceiling enforcer
      const ceilingResult = this.ceilingEnforcer.checkBeforeIteration({
        iterationNumber: n,
        maxIterations: effectiveMaxIterations,
        cumulativeCostUsd: turnState.cumulativeCostUsd!,
        cumulativeWallclockMs: turnState.cumulativeWallclockMs!,
        totalCostBudgetUsd: DEFAULT_TOTAL_COST_BUDGET_USD,
        totalWallclockBudgetMs: DEFAULT_TOTAL_WALLCLOCK_BUDGET_MS,
      })

      if (!ceilingResult.allowed) {
        // Exit with partial — check for drafts
        const result = await this._exitWithCeilingBreach(allOutputs, iterationHistory, opts)
        this._recordTurnMetrics(turnState.tenantId, result, iterationHistory)
        return result
      }

      // Step (c): Emit SSE: iteration.started
      streamEmitter.emit({
        type: 'iteration.started',
        payload: {
          n,
          sub_agent_domain: currentDirective.sub_agent_key,
          selection_reason: currentDirective.reason,
          taint_at_start: turnState.tainted.value,
        },
      })

      // Step (d): Run SubAgentRunner
      const iterationStartMs = Date.now()

      const subOutput = await this.subAgentRunner.run({
        directive: currentDirective,
        phase: 1,
        abortSignal,
        turnState,
      })

      const iterationDurationMs = Date.now() - iterationStartMs

      // Step (e): Collect SubAgentOutput; push to iterationHistory
      const iterKey = `iteration-${n}-${currentDirective.sub_agent_key}`
      allOutputs.set(iterKey, subOutput)

      // Step (f): Update cumulativeCostUsd + cumulativeWallclockMs
      turnState.cumulativeCostUsd =
        (turnState.cumulativeCostUsd ?? 0) + (subOutput.usageTotals.costUsd ?? 0)
      turnState.cumulativeWallclockMs = (turnState.cumulativeWallclockMs ?? 0) + iterationDurationMs

      // Step (g): Run CompletionScorerRunner
      const scorerResult = await this.completionScorerRunner.runScorers({
        scorerIds: completionCriteria.scorerIds,
        strategy: completionCriteria.strategy,
        iterationOutput: subOutput,
        turnState,
        tenantId: turnState.tenantId,
      })

      const iterRecord: IterationRecord = {
        iterationNumber: n,
        subAgentKey: currentDirective.sub_agent_key,
        directive: currentDirective,
        output: subOutput,
        scorerResults: scorerResult.results,
        isComplete: scorerResult.isComplete,
      }

      iterationHistory.push(iterRecord)
      turnState.iterationHistory = iterationHistory

      // Step (h): Emit SSE: iteration.validated
      streamEmitter.emit({
        type: 'iteration.validated',
        payload: {
          n,
          passed: scorerResult.isComplete,
          scorer_results: scorerResult.results,
          max_iterations_reached: n >= effectiveMaxIterations,
        },
      })

      // Step (i): Emit SSE: iteration.ended
      streamEmitter.emit({
        type: 'iteration.ended',
        payload: {
          n,
          is_complete: scorerResult.isComplete,
          usage: {
            input_tokens: subOutput.usageTotals.inputTokens,
            output_tokens: subOutput.usageTotals.outputTokens,
            input_cached_read: subOutput.usageTotals.inputCachedRead,
            input_cached_write: subOutput.usageTotals.inputCachedWrite,
            output_reasoning: subOutput.usageTotals.outputReasoning,
          },
        },
      })

      // Step (j): Check abort signal again
      if (abortSignal.aborted) {
        const result: PhaseExecutionResult = { kind: 'aborted', reason: 'user' }
        this._recordTurnMetrics(turnState.tenantId, result, iterationHistory)
        return result
      }

      // Step (k): Check exit conditions (scorer complete or maxIterations reached)
      if (scorerResult.isComplete || n >= effectiveMaxIterations) {
        if (n >= effectiveMaxIterations && !scorerResult.isComplete) {
          maxIterationsBreached = true
        }
        break
      }

      // Step (l): IterativeRePlanner.replan()
      const replanResult = await this.replanner.replan({
        turnState,
        priorIteration: iterRecord,
        iterationHistory: iterationHistory.slice(0, -1), // exclude current from history arg
        completionCriteria,
        userUtterance,
        abortSignal,
        tenantId: turnState.tenantId,
      })

      if (replanResult.kind === 'exit') {
        if (replanResult.reason === 'disambiguation') {
          const result: PhaseExecutionResult = {
            kind: 'disambiguation',
            question: replanResult.disambiguationQuestion ?? 'Please clarify your request.',
          }
          this._recordTurnMetrics(turnState.tenantId, result, iterationHistory)
          return result
        }
        // stuck or complete → break to synthesizer
        break
      }

      // Continue: advance iteration
      turnState.iterationNumber = n + 1
      currentDirective = replanResult.nextDirective
    }

    // ── Post-loop: synthesize all iteration outputs ────────────────────────────
    const result = await this._synthesize(allOutputs, iterationHistory, opts)

    // Record turn metrics (including iteration count exceeded if applicable)
    this._recordTurnMetrics(turnState.tenantId, result, iterationHistory, maxIterationsBreached)

    return result
  }

  /**
   * Records turn-end metrics for the iterative topology (Plan 12 §8).
   *
   * Emits:
   *   - agent_iterative_turn_total{tenant_id, outcome}
   *   - agent_turn_iterations_total histogram{tenant_id} with the iteration count
   *   - agent_iteration_count_exceeded_p95 gauge if maxIterationsBreached
   *
   * Errors from OTel calls are swallowed — metrics must never fail a user turn.
   */
  private _recordTurnMetrics(
    tenantId: string,
    result: PhaseExecutionResult,
    iterationHistory: IterationRecord[],
    maxIterationsBreached = false,
  ): void {
    try {
      recordIterativeTurnTotal(tenantId, result.kind)
      recordIterationsTotalHistogram(tenantId, iterationHistory.length)
      if (maxIterationsBreached) {
        recordIterationCountExceeded(tenantId)
      }
    } catch {
      // Metric emission must never fail a user turn
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Handles the ceiling-breach exit path.
   *
   * Plan 12 §5 partial-answer gate:
   *   - If any drafts were produced → { kind: 'aborted', reason: 'budget' }
   *   - Otherwise → synthesize what we have → { kind: 'partial', reason: 'limit_reached' }
   */
  private async _exitWithCeilingBreach(
    allOutputs: Map<string, SubAgentOutput>,
    iterationHistory: IterationRecord[],
    opts: IterativeOrchestratorOpts,
  ): Promise<PhaseExecutionResult> {
    const hasDrafts = this._hasDrafts(allOutputs)

    if (hasDrafts) {
      return { kind: 'aborted', reason: 'budget' }
    }

    // No drafts: synthesize what we have (may be empty if ceiling hit on iter 1)
    return await this._synthesize(allOutputs, iterationHistory, opts)
  }

  /**
   * Runs the synthesizer over all iteration outputs.
   *
   * For the iterative topology, all sub-agent outputs are passed as `phase1Outputs`
   * (plan 12 §5: "Synthesizer input is iteration outputs — multi-source, same shape
   * as bounded's phase1+phase2").
   */
  private async _synthesize(
    allOutputs: Map<string, SubAgentOutput>,
    iterationHistory: IterationRecord[],
    opts: IterativeOrchestratorOpts,
  ): Promise<PhaseExecutionResult> {
    const { initialPlan, userUtterance, turnState, abortSignal } = opts

    // Build a BoundedPlan-compatible directive so Synthesizer.synthesize() can accept it
    const syntheticBoundedDirective = {
      topology: 'bounded' as const,
      intent_slug: initialPlan.intent_slug,
      flow_id: initialPlan.flow_id,
      phase1: [initialPlan.initialDirective],
      phase2: [],
    }

    const synthOutput = await this.synthesizer.synthesize({
      directive: syntheticBoundedDirective,
      phase1Outputs: allOutputs,
      phase2Outputs: new Map(),
      userUtterance,
      abortSignal,
      turnState,
    })

    // Collect all drafts from iteration outputs
    const drafts: DraftProposal[] = []
    for (const record of iterationHistory) {
      if (record.output.drafts) {
        drafts.push(...record.output.drafts)
      }
    }

    // Determine if this was a full completion or partial.
    // scorer result is authoritative for completion classification;
    // replanner exit(complete) means "no more iterations" not "succeeded".
    const wasCompleted =
      iterationHistory.length > 0 && iterationHistory[iterationHistory.length - 1]!.isComplete

    if (wasCompleted) {
      return { kind: 'synthesized', answer: synthOutput, drafts }
    }

    return { kind: 'partial', answer: synthOutput, reason: 'limit_reached' }
  }

  /**
   * Returns true if any iteration output contains draft proposals.
   */
  private _hasDrafts(allOutputs: Map<string, SubAgentOutput>): boolean {
    for (const output of allOutputs.values()) {
      if (output.drafts && output.drafts.length > 0) {
        return true
      }
    }
    return false
  }
}
