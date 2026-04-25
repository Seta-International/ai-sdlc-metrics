/**
 * iteration-ceiling-enforcer.ts — Plan 12 Task 2
 *
 * Pure guard that decides whether the iterative supervisor loop may run
 * another iteration, given the accumulated cost, wallclock time, and
 * iteration count (plan 12 §3 ceiling rules).
 *
 * No external dependencies — all limits are passed via opts at call time.
 */

import { Injectable } from '@nestjs/common'

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface CheckBeforeIterationOpts {
  /** 1-based iteration number about to start. */
  iterationNumber: number
  /** Maximum iterations allowed, from CompletionSpec. */
  maxIterations: number
  /** Accumulated LLM cost in USD from previous iterations. */
  cumulativeCostUsd: number
  /** Accumulated wall-clock time in ms from previous iterations. */
  cumulativeWallclockMs: number
  /**
   * Optional cost hint for the upcoming iteration.
   * When provided, an additional check ensures the remaining headroom is
   * sufficient: if cumulativeCostUsd + estimatedNextCostUsd > perTurnCostBudgetUsd
   * the iteration is blocked (cumulative_cost).
   */
  estimatedNextCostUsd?: number
  /** Hard ceiling on cumulative LLM cost in USD for all iterations combined. */
  perTurnCostBudgetUsd: number
  /** Hard ceiling on cumulative wall-clock time in ms for all iterations combined. */
  perTurnWallclockBudgetMs: number
}

export interface CeilingCheckResult {
  allowed: boolean
  reason?: 'max_iterations' | 'cumulative_cost' | 'cumulative_wallclock'
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class IterationCeilingEnforcer {
  /**
   * Checks whether the supervisor loop may proceed with the next iteration.
   *
   * Order of checks:
   *   1. iterationNumber > maxIterations          → max_iterations
   *   2. cumulativeCostUsd >= perTurnCostBudgetUsd → cumulative_cost
   *   2b. if estimatedNextCostUsd provided:
   *       cumulativeCostUsd + estimatedNextCostUsd > perTurnCostBudgetUsd → cumulative_cost
   *   3. cumulativeWallclockMs >= perTurnWallclockBudgetMs → cumulative_wallclock
   *   4. Otherwise → allowed
   */
  checkBeforeIteration(opts: CheckBeforeIterationOpts): CeilingCheckResult {
    const {
      iterationNumber,
      maxIterations,
      cumulativeCostUsd,
      cumulativeWallclockMs,
      estimatedNextCostUsd,
      perTurnCostBudgetUsd,
      perTurnWallclockBudgetMs,
    } = opts

    if (iterationNumber > maxIterations) {
      return { allowed: false, reason: 'max_iterations' }
    }

    if (cumulativeCostUsd >= perTurnCostBudgetUsd) {
      return { allowed: false, reason: 'cumulative_cost' }
    }

    if (
      estimatedNextCostUsd !== undefined &&
      cumulativeCostUsd + estimatedNextCostUsd > perTurnCostBudgetUsd
    ) {
      return { allowed: false, reason: 'cumulative_cost' }
    }

    if (cumulativeWallclockMs >= perTurnWallclockBudgetMs) {
      return { allowed: false, reason: 'cumulative_wallclock' }
    }

    return { allowed: true }
  }
}
