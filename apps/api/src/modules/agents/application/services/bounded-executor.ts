/**
 * BoundedExecutor — Plan 18 §4.1.
 *
 * Drives the bounded-tier execution plan:
 *   1. Sequential phase-1 fan-out (CLAUDE.md DB rule — single PoolClient per request)
 *   2. Partial-answer gate (R-03.19, R-03.20):
 *        - 'no_ceiling'        → continue to (optional) phase-2 + synthesizer
 *        - 'surface_partial'   → synthesize what we have, return { kind: 'partial' }
 *        - 'suppress_partial'  → suppress narrative, return drafts only
 *   3. Optional sequential phase-2 fan-out, with circuit-breaker context note
 *      propagated via `turnState.phaseContextNote` (set BEFORE phase-2 dispatch,
 *      cleared AFTER) so SubAgentRunnerAdapter can read it without a directive
 *      schema change (Plan 18 §5).
 *   4. Single synthesizer call over a unified `outputs` map (Plan 18 §1).
 *
 * Returns PhaseExecutionResult — same union shape as IterativeOrchestrator.
 */

import { Injectable, Inject } from '@nestjs/common'
import { evaluatePartialAnswerGate, buildCircuitBreakerContextNote } from './phase-executor'
import type {
  PhaseExecutionResult,
  PhaseExecutorTurnState,
  SubAgentOutput,
  DraftProposal,
  SynthesizerOutput,
  SubAgentKey,
} from './phase-executor-contracts'
import type { BoundedPlan } from '../../domain/value-objects/router-plan-schema'
import type { StreamEmitter } from './stream-gateway'
import {
  I_SUB_AGENT_RUNNER,
  I_SYNTHESIZER,
  type ISubAgentRunner,
  type ISynthesizer,
} from './iterative-orchestrator'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const BOUNDED_EXECUTOR = Symbol('BOUNDED_EXECUTOR')

// ─── Execute opts ─────────────────────────────────────────────────────────────

export interface BoundedExecutorOpts {
  readonly plan: BoundedPlan
  readonly userUtterance: string
  readonly turnState: PhaseExecutorTurnState
  readonly abortSignal: AbortSignal
  readonly streamEmitter: StreamEmitter
}

// ─── BoundedExecutor ──────────────────────────────────────────────────────────

@Injectable()
export class BoundedExecutor {
  constructor(
    @Inject(I_SUB_AGENT_RUNNER) private readonly subAgentRunner: ISubAgentRunner,
    @Inject(I_SYNTHESIZER) private readonly synthesizer: ISynthesizer,
  ) {}

  async execute(opts: BoundedExecutorOpts): Promise<PhaseExecutionResult> {
    const { plan, userUtterance, turnState, abortSignal, streamEmitter } = opts

    if (abortSignal.aborted) {
      return { kind: 'aborted', reason: 'user' }
    }

    streamEmitter.emit({ type: 'phase.started', payload: { phase: 'phase-1' } })

    const outputs = new Map<SubAgentKey, SubAgentOutput>()

    // ── Phase 1: sequential fan-out ───────────────────────────────────────────
    for (const directive of plan.phase1) {
      if (abortSignal.aborted) {
        return { kind: 'aborted', reason: 'user' }
      }
      const out = await this.subAgentRunner.run({
        directive,
        phase: 1,
        abortSignal,
        turnState,
      })
      outputs.set(directive.sub_agent_key, out)
    }

    // ── Partial-answer gate ───────────────────────────────────────────────────
    const gate = evaluatePartialAnswerGate(outputs)

    if (gate === 'suppress_partial') {
      const suppressed: SynthesizerOutput = {
        shape: 'narrative',
        content: 'Drafts proposed for review; no answer this turn (writes-only guard).',
        citations: [],
        confidence: 'low',
        turnEndedReason: 'completed',
      }
      return {
        kind: 'synthesized',
        answer: suppressed,
        drafts: collectDraftsFrom(outputs),
      }
    }

    if (gate === 'surface_partial') {
      const answer = await this.synthesizer.synthesize({
        directive: plan,
        outputs,
        userUtterance,
        turnState,
        abortSignal,
        streamEmitter,
      })
      return { kind: 'partial', answer, reason: 'limit_reached' }
    }

    // gate === 'no_ceiling'

    // ── Phase 2: optional sequential fan-out ──────────────────────────────────
    if (plan.phase2.length > 0) {
      streamEmitter.emit({ type: 'phase.started', payload: { phase: 'phase-2' } })

      const cbNote = buildCircuitBreakerContextNote(aggregateCbState(outputs))
      // SubAgentRunnerAdapter reads turnState.phaseContextNote when constructing
      // the sub-agent user message — set it before phase-2 dispatch.
      turnState.phaseContextNote = cbNote ? cbNote : undefined

      try {
        for (const directive of plan.phase2) {
          if (abortSignal.aborted) {
            return { kind: 'aborted', reason: 'user' }
          }
          const out = await this.subAgentRunner.run({
            directive,
            phase: 2,
            abortSignal,
            turnState,
          })
          outputs.set(directive.sub_agent_key, out)
        }
      } finally {
        // Clear after phase-2 — prevents leak into the synthesizer call.
        turnState.phaseContextNote = undefined
      }
    }

    // ── Synthesize over the unified outputs map ───────────────────────────────
    const answer = await this.synthesizer.synthesize({
      directive: plan,
      outputs,
      userUtterance,
      turnState,
      abortSignal,
      streamEmitter,
    })

    return {
      kind: 'synthesized',
      answer,
      drafts: collectDraftsFrom(outputs),
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function collectDraftsFrom(outputs: Map<SubAgentKey, SubAgentOutput>): DraftProposal[] {
  const drafts: DraftProposal[] = []
  for (const out of outputs.values()) {
    if (out.drafts && out.drafts.length > 0) {
      drafts.push(...out.drafts)
    }
  }
  return drafts
}

function aggregateCbState(
  outputs: Map<SubAgentKey, SubAgentOutput>,
): Record<string, { disabled: boolean; reason: string }> {
  const cb: Record<string, { disabled: boolean; reason: string }> = {}
  for (const out of outputs.values()) {
    Object.assign(cb, out.circuitBreakerState ?? {})
  }
  return cb
}
