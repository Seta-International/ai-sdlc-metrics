/**
 * shadow-diff-scorer.spec.ts — Plan 11 Task 4
 *
 * Unit tests for ShadowDiffScorer (deterministic rule-based diff scoring).
 * Pure logic — no DB dependency, no injection needed.
 */

import { describe, it, expect } from 'vitest'
import { ShadowDiffScorer } from './shadow-diff-scorer'
import type { TurnResult } from './shadow-diff-scorer'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTurnResult(overrides: Partial<TurnResult> = {}): TurnResult {
  return {
    toolCallNames: [],
    permissionKeys: [],
    answerShape: 'short-answer',
    ...overrides,
  }
}

const scorer = new ShadowDiffScorer()

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ShadowDiffScorer.score()', () => {
  it('1. identical outputs → score: 0, category: identical', () => {
    const baseline = makeTurnResult({
      toolCallNames: ['people.list', 'people.get'],
      permissionKeys: ['people:read'],
      answerShape: 'list',
    })
    const candidate = makeTurnResult({
      toolCallNames: ['people.list', 'people.get'],
      permissionKeys: ['people:read'],
      answerShape: 'list',
    })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.score).toBe(0)
    expect(result.category).toBe('identical')
    expect(result.componentDiffs.toolCallOverlap).toBe(1)
    expect(result.componentDiffs.shapeDiff).toBe(0)
    expect(result.componentDiffs.permissionKeyOverlap).toBe(1)
  })

  it('2. both sides have empty tool calls → toolCallOverlap = 1.0', () => {
    const baseline = makeTurnResult({
      toolCallNames: [],
      permissionKeys: [],
      answerShape: 'short-answer',
    })
    const candidate = makeTurnResult({
      toolCallNames: [],
      permissionKeys: [],
      answerShape: 'short-answer',
    })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.componentDiffs.toolCallOverlap).toBe(1)
    expect(result.score).toBe(0)
    expect(result.category).toBe('identical')
  })

  it('3. divergent tool calls, same shape, both empty permission keys → score 0.5, major_difference', () => {
    // baseline: ['people.list', 'people.get'], candidate: ['hiring.list']
    // intersection = {}, union = {'people.list','people.get','hiring.list'} → overlap = 0/3 = 0
    // shapeDiff = 0 (same short-answer)
    // permissionKeyOverlap = 1.0 (both empty)
    // score = (1-0)*0.5 + 0*0.3 + (1-1)*0.2 = 0.5 → major_difference
    const baseline = makeTurnResult({
      toolCallNames: ['people.list', 'people.get'],
      permissionKeys: [],
      answerShape: 'short-answer',
    })
    const candidate = makeTurnResult({
      toolCallNames: ['hiring.list'],
      permissionKeys: [],
      answerShape: 'short-answer',
    })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.componentDiffs.toolCallOverlap).toBe(0)
    expect(result.componentDiffs.shapeDiff).toBe(0)
    expect(result.componentDiffs.permissionKeyOverlap).toBe(1)
    expect(result.score).toBeCloseTo(0.5)
    expect(result.category).toBe('major_difference')
  })

  it('4. minor shape difference only (same tools, different shape, same empty perms) → minor_difference', () => {
    // toolCallOverlap = 1.0 (same tools), shapeDiff = 1, permissionKeyOverlap = 1.0
    // score = (1-1)*0.5 + 1*0.3 + (1-1)*0.2 = 0.3 → 0.3 < 0.4 → minor_difference
    const baseline = makeTurnResult({
      toolCallNames: ['people.list'],
      permissionKeys: [],
      answerShape: 'short-answer',
    })
    const candidate = makeTurnResult({
      toolCallNames: ['people.list'],
      permissionKeys: [],
      answerShape: 'list',
    })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.componentDiffs.toolCallOverlap).toBe(1)
    expect(result.componentDiffs.shapeDiff).toBe(1)
    expect(result.componentDiffs.permissionKeyOverlap).toBe(1)
    expect(result.score).toBeCloseTo(0.3)
    expect(result.category).toBe('minor_difference')
  })

  it('5. shadow errored (candidateOutput: null) → category: shadow_errored, score: 1', () => {
    const baseline = makeTurnResult({
      toolCallNames: ['people.list'],
      permissionKeys: ['people:read'],
      answerShape: 'list',
    })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: null })

    expect(result.score).toBe(1)
    expect(result.category).toBe('shadow_errored')
    expect(result.componentDiffs.toolCallOverlap).toBe(0)
    expect(result.componentDiffs.shapeDiff).toBe(0)
    expect(result.componentDiffs.permissionKeyOverlap).toBe(0)
  })

  it('6. partial tool overlap → toolCallOverlap = 0.5', () => {
    // baseline: ['a','b','c'], candidate: ['b','c','d']
    // intersection = {'b','c'} = 2, union = {'a','b','c','d'} = 4 → overlap = 0.5
    const baseline = makeTurnResult({ toolCallNames: ['a', 'b', 'c'] })
    const candidate = makeTurnResult({ toolCallNames: ['b', 'c', 'd'] })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.componentDiffs.toolCallOverlap).toBe(0.5)
  })

  it('7. score is clamped to [0, 1] — maximum divergence produces at most 1', () => {
    // Worst case: toolCallOverlap=0, shapeDiff=1, permissionKeyOverlap=0
    // score = 1*0.5 + 1*0.3 + 1*0.2 = 1.0
    const baseline = makeTurnResult({
      toolCallNames: ['tool-a'],
      permissionKeys: ['perm-a'],
      answerShape: 'list',
    })
    const candidate = makeTurnResult({
      toolCallNames: ['tool-b'],
      permissionKeys: ['perm-b'],
      answerShape: 'short-answer',
    })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.score).toBeLessThanOrEqual(1)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeCloseTo(1)
  })

  it('8a. category boundary: score === 0 → identical', () => {
    const baseline = makeTurnResult()
    const candidate = makeTurnResult()

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.score).toBe(0)
    expect(result.category).toBe('identical')
  })

  it('8b. category boundary: mixed divergence → major_difference', () => {
    // intersection tools = {b} = 1, union = {a,b,c} = 3 → toolCallOverlap = 1/3
    // intersection perms = {perm-b} = 1, union = {perm-a,perm-b,perm-c} = 3 → permissionKeyOverlap = 1/3
    // shapeDiff = 0 (same shape)
    // score = (1-1/3)*0.5 + 0*0.3 + (1-1/3)*0.2 = (2/3)*0.5 + (2/3)*0.2 ≈ 0.467 → major_difference
    const baseline = makeTurnResult({
      toolCallNames: ['a', 'b'],
      permissionKeys: ['perm-a', 'perm-b'],
      answerShape: 'short-answer',
    })
    const candidate = makeTurnResult({
      toolCallNames: ['b', 'c'],
      permissionKeys: ['perm-b', 'perm-c'],
      answerShape: 'short-answer',
    })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.score).toBeGreaterThan(0.4)
    expect(result.score).toBeLessThan(1)
    expect(result.category).toBe('major_difference')
  })

  it('8c. category boundary: score === 0.4 → major_difference', () => {
    // toolCallOverlap=1, shapeDiff=1, permissionKeyOverlap=0.5 would give 0.4
    // But permissionKeyOverlap=0.5 requires: 1 common out of 2 total → intersection=1, union=2
    // baseline: ['perm-a','perm-b'], candidate: ['perm-b','perm-c']
    // intersection = {perm-b} = 1, union = {perm-a,perm-b,perm-c} = 3 → overlap = 1/3 not 0.5
    // Use: baseline: ['perm-a'], candidate: ['perm-a','perm-b']
    // intersection = {perm-a} = 1, union = {perm-a,perm-b} = 2 → overlap = 0.5
    // score = (1-1)*0.5 + 1*0.3 + (1-0.5)*0.2 = 0 + 0.3 + 0.1 = 0.4 → major_difference
    const baseline = makeTurnResult({
      toolCallNames: ['shared-tool'],
      permissionKeys: ['perm-a'],
      answerShape: 'list',
    })
    const candidate = makeTurnResult({
      toolCallNames: ['shared-tool'],
      permissionKeys: ['perm-a', 'perm-b'],
      answerShape: 'short-answer',
    })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.componentDiffs.toolCallOverlap).toBe(1)
    expect(result.componentDiffs.shapeDiff).toBe(1)
    expect(result.componentDiffs.permissionKeyOverlap).toBe(0.5)
    expect(result.score).toBeCloseTo(0.4)
    expect(result.category).toBe('major_difference')
  })

  it('9. both empty permission keys → permissionKeyOverlap = 1.0', () => {
    const baseline = makeTurnResult({ permissionKeys: [] })
    const candidate = makeTurnResult({ permissionKeys: [] })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.componentDiffs.permissionKeyOverlap).toBe(1)
  })

  it('10. completely disjoint permission keys → permissionKeyOverlap = 0', () => {
    const baseline = makeTurnResult({ permissionKeys: ['perm-a'] })
    const candidate = makeTurnResult({ permissionKeys: ['perm-b'] })

    const result = scorer.score({ baselineOutput: baseline, candidateOutput: candidate })

    expect(result.componentDiffs.permissionKeyOverlap).toBe(0)
  })
})
