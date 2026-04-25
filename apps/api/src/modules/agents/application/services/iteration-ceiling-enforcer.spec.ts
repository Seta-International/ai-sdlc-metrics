/**
 * iteration-ceiling-enforcer.spec.ts — Plan 12 Task 2
 *
 * Unit tests for IterationCeilingEnforcer.checkBeforeIteration() per plan 12 §11.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { IterationCeilingEnforcer } from './iteration-ceiling-enforcer'

describe('IterationCeilingEnforcer', () => {
  let enforcer: IterationCeilingEnforcer

  beforeEach(() => {
    enforcer = new IterationCeilingEnforcer()
  })

  it('1. cumulative cost >= budget → not allowed (cumulative_cost)', () => {
    const result = enforcer.checkBeforeIteration({
      iterationNumber: 2,
      maxIterations: 5,
      cumulativeCostUsd: 1.0,
      cumulativeWallclockMs: 1000,
      totalCostBudgetUsd: 1.0,
      totalWallclockBudgetMs: 60_000,
    })

    expect(result).toEqual({ allowed: false, reason: 'cumulative_cost' })
  })

  it('2. cumulative cost + estimated next > budget → not allowed (cumulative_cost)', () => {
    const result = enforcer.checkBeforeIteration({
      iterationNumber: 2,
      maxIterations: 5,
      cumulativeCostUsd: 0.8,
      cumulativeWallclockMs: 1000,
      estimatedNextCostUsd: 0.3,
      totalCostBudgetUsd: 1.0,
      totalWallclockBudgetMs: 60_000,
    })

    expect(result).toEqual({ allowed: false, reason: 'cumulative_cost' })
  })

  it('3. iteration count > max → not allowed (max_iterations)', () => {
    const result = enforcer.checkBeforeIteration({
      iterationNumber: 6,
      maxIterations: 5,
      cumulativeCostUsd: 0.1,
      cumulativeWallclockMs: 1000,
      totalCostBudgetUsd: 10.0,
      totalWallclockBudgetMs: 60_000,
    })

    expect(result).toEqual({ allowed: false, reason: 'max_iterations' })
  })

  it('4. wallclock >= budget → not allowed (cumulative_wallclock)', () => {
    const result = enforcer.checkBeforeIteration({
      iterationNumber: 2,
      maxIterations: 5,
      cumulativeCostUsd: 0.1,
      cumulativeWallclockMs: 60_000,
      totalCostBudgetUsd: 10.0,
      totalWallclockBudgetMs: 60_000,
    })

    expect(result).toEqual({ allowed: false, reason: 'cumulative_wallclock' })
  })

  it('5. all within limits → allowed', () => {
    const result = enforcer.checkBeforeIteration({
      iterationNumber: 2,
      maxIterations: 5,
      cumulativeCostUsd: 0.5,
      cumulativeWallclockMs: 30_000,
      totalCostBudgetUsd: 2.0,
      totalWallclockBudgetMs: 120_000,
    })

    expect(result).toEqual({ allowed: true })
  })

  it('6. first iteration (number=1) with zero cumulative → allowed', () => {
    const result = enforcer.checkBeforeIteration({
      iterationNumber: 1,
      maxIterations: 5,
      cumulativeCostUsd: 0,
      cumulativeWallclockMs: 0,
      totalCostBudgetUsd: 1.0,
      totalWallclockBudgetMs: 60_000,
    })

    expect(result).toEqual({ allowed: true })
  })

  it('7. cumulative cost exactly at budget (>=) without estimatedNext → not allowed', () => {
    const result = enforcer.checkBeforeIteration({
      iterationNumber: 3,
      maxIterations: 10,
      cumulativeCostUsd: 5.0,
      cumulativeWallclockMs: 100,
      totalCostBudgetUsd: 5.0,
      totalWallclockBudgetMs: 100_000,
    })

    expect(result).toEqual({ allowed: false, reason: 'cumulative_cost' })
  })

  it('8. estimatedNext provided but cumulative + next <= budget → allowed (if other checks pass)', () => {
    const result = enforcer.checkBeforeIteration({
      iterationNumber: 2,
      maxIterations: 5,
      cumulativeCostUsd: 0.4,
      cumulativeWallclockMs: 1000,
      estimatedNextCostUsd: 0.5,
      totalCostBudgetUsd: 1.0,
      totalWallclockBudgetMs: 60_000,
    })

    // 0.4 + 0.5 = 0.9 which is NOT > 1.0, so allowed
    expect(result).toEqual({ allowed: true })
  })

  it('9. max_iterations checked before cost checks (iterationNumber > max)', () => {
    // iterationNumber > maxIterations AND cumulative cost >= budget
    // max_iterations is checked first
    const result = enforcer.checkBeforeIteration({
      iterationNumber: 10,
      maxIterations: 5,
      cumulativeCostUsd: 100.0,
      cumulativeWallclockMs: 999_999,
      totalCostBudgetUsd: 1.0,
      totalWallclockBudgetMs: 1.0,
    })

    expect(result).toEqual({ allowed: false, reason: 'max_iterations' })
  })
})
