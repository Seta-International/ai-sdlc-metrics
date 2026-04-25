/**
 * completion-scorer-runner.ts — Plan 12 Task 2
 *
 * Resolves completion scorers from the ScorerRegistry and runs them against the
 * most recent iteration output to decide whether the supervisor loop may exit.
 *
 * Plan 12 §3.1 invariant 4: only deterministic scorers may serve as exit-gate
 * scorers. A non-deterministic scorer reaching this runner is a programming
 * error that should have been caught at plan-validation time — so we throw hard.
 */

import { Injectable } from '@nestjs/common'
import { ScorerRegistry } from './scorer-registry'
import { recordCompletionScorerFail } from '../../infrastructure/observability/gateway-metrics'
import type { ScorerResult } from '../../domain/scorer-types'
import type { SubAgentOutput, PhaseExecutorTurnState } from './phase-executor-contracts'

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface RunScorersOpts {
  /** IDs of scorers to execute, in order. */
  scorerIds: string[]
  /**
   * Determines how scorer results are combined to produce `isComplete`:
   * - `'all'`: every scorer must pass (logical AND).
   * - `'any'`: at least one scorer must pass (logical OR).
   */
  strategy: 'all' | 'any'
  /** Output from the most recently completed sub-agent iteration. */
  iterationOutput: SubAgentOutput
  /** Shared turn-state threaded through all phase-03 components. */
  turnState: PhaseExecutorTurnState
  /**
   * Tenant ID for metric recording (Plan 12 §8).
   * Optional — if omitted, scorer-fail metrics are skipped (non-iterative paths).
   */
  tenantId?: string
}

export interface RunScorersResult {
  /** Whether the exit criterion is met given the strategy and scorer results. */
  isComplete: boolean
  /** Individual scorer outcomes, in the same order as `scorerIds`. */
  results: ScorerResult[]
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CompletionScorerRunner {
  constructor(private readonly scorerRegistry: ScorerRegistry) {}

  /**
   * Runs each scorer in `scorerIds` and evaluates the exit criterion.
   *
   * Per-scorer behaviour:
   *   - Scorer not found in registry → push error result (score: 0, passed: false).
   *   - Scorer found but kind !== 'deterministic' → throw hard (programming error).
   *   - Scorer.run() throws → catch, push error result, continue.
   *
   * Strategy:
   *   - `'all'`: `isComplete = results.every(r => r.passed)` (vacuously true for empty list).
   *   - `'any'`: `isComplete = results.some(r => r.passed)` (vacuously false for empty list).
   */
  async runScorers(opts: RunScorersOpts): Promise<RunScorersResult> {
    const { scorerIds, strategy, iterationOutput, turnState, tenantId } = opts
    const results: ScorerResult[] = []

    for (const scorerId of scorerIds) {
      const scorer = this.scorerRegistry.findById(scorerId)

      if (scorer === undefined) {
        results.push({ score: 0, passed: false, reason: `scorer not found: ${scorerId}` })
        continue
      }

      if (scorer.kind !== 'deterministic') {
        throw new Error(
          `CompletionScorerRunner: scorer ${scorerId} is kind ${scorer.kind}, only deterministic scorers allowed at MVP (plan 12 §3.1 invariant 4)`,
        )
      }

      const ctx = {
        traceId: turnState.traceId,
        // For iterative-topology exit-gate scorers, the relevant evaluation
        // payload is the iteration output — there is no separate "input" object.
        // ScorerContext is a generic shape; the exit-gate scorer kind evaluates
        // the output that was produced, not the directive that triggered it.
        // input mirrors output intentionally so the generic interface is satisfied.
        input: iterationOutput,
        output: iterationOutput,
        requestContext: {
          tenantId: turnState.tenantId,
          userId: turnState.userId,
          traceId: turnState.traceId,
        },
      }

      try {
        const result = await scorer.run(ctx)
        results.push(result)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        results.push({ score: 0, passed: false, reason: `scorer ${scorerId} threw: ${message}` })
        // Record metric when a scorer throws (Plan 12 §8)
        if (tenantId) {
          try {
            recordCompletionScorerFail(tenantId, scorerId)
          } catch {
            // Metric emission must never fail a user turn
          }
        }
      }
    }

    const isComplete =
      strategy === 'all' ? results.every((r) => r.passed) : results.some((r) => r.passed)

    return { isComplete, results }
  }
}
