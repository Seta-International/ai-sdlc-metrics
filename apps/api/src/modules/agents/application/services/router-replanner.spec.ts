/**
 * router-replanner.spec.ts — Plan 03 §5 "Plan-shape mismatch (one bounded re-plan)"
 *
 * Tests the RouterReplanner's pure logic:
 *
 *   1. canReplan returns true when routerReplanCount is 0
 *   2. canReplan returns false when routerReplanCount is 1 (max 1 replan)
 *   3. buildReplanContext includes the mismatch description
 *   4. buildReplanContext includes phase1 output summaries
 *   5. buildReplanContext is a structured object, not raw LLM output
 *
 * The actual LLM re-invocation lives in the full RouterReplanner service (requires
 * router LLM client DI). These tests cover the pure helpers that don't need DI.
 */

import { describe, it, expect } from 'vitest'
import { canReplan, buildReplanContext } from './router-replanner'
import type { SubAgentOutput, PhaseShapeMismatch } from './phase-executor-contracts'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOutput(summary: string, semantics = 'data'): SubAgentOutput {
  return {
    kind: 'completed',
    summary,
    semantics,
    confidence: 'high',
    sourceToolProvenance: [],
    structured: { result: summary },
    drafts: undefined,
    circuitBreakerState: {},
    usageTotals: {
      inputTokens: 100,
      outputTokens: 50,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0.001,
    },
  }
}

const MISMATCH: PhaseShapeMismatch = {
  phase2Required: ['taskCount', 'projectIds'],
  phase1Missing: ['taskCount'],
}

// ─── canReplan ────────────────────────────────────────────────────────────────

describe('canReplan', () => {
  it('1. returns true when routerReplanCount is 0 (replan not yet used)', () => {
    expect(canReplan(0)).toBe(true)
  })

  it('2. returns false when routerReplanCount is 1 (max 1 replan per turn)', () => {
    expect(canReplan(1)).toBe(false)
  })
})

// ─── buildReplanContext ───────────────────────────────────────────────────────

describe('buildReplanContext', () => {
  const phase1Outputs = new Map([
    ['planner.reader', makeOutput('5 tasks', 'open tasks')],
    ['people.reader', makeOutput('Alice is active', 'user status')],
  ])

  it('3. includes the mismatch description (required fields + missing fields)', () => {
    const ctx = buildReplanContext({
      mismatch: MISMATCH,
      phase1Outputs,
    })
    expect(ctx.mismatch.phase2Required).toContain('taskCount')
    expect(ctx.mismatch.phase2Required).toContain('projectIds')
    expect(ctx.mismatch.phase1Missing).toContain('taskCount')
  })

  it('4. includes phase1 output summaries for context', () => {
    const ctx = buildReplanContext({
      mismatch: MISMATCH,
      phase1Outputs,
    })
    expect(ctx.phase1Summaries['planner.reader']).toBe('5 tasks')
    expect(ctx.phase1Summaries['people.reader']).toBe('Alice is active')
  })

  it('5. returns a structured object (not a string blob)', () => {
    const ctx = buildReplanContext({
      mismatch: MISMATCH,
      phase1Outputs,
    })
    expect(typeof ctx).toBe('object')
    expect(ctx).toHaveProperty('mismatch')
    expect(ctx).toHaveProperty('phase1Summaries')
  })

  it('handles empty phase1 outputs gracefully', () => {
    const ctx = buildReplanContext({
      mismatch: MISMATCH,
      phase1Outputs: new Map(),
    })
    expect(ctx.phase1Summaries).toEqual({})
    expect(ctx.mismatch).toEqual(MISMATCH)
  })
})
