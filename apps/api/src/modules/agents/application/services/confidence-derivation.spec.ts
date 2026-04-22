/**
 * confidence-derivation.spec.ts — Plan 03 §5 "Confidence derivation (rule-based)"
 *
 * Tests each entry in the per-sub-agent confidence rule table (R-03.22):
 *
 *   high: corroborated by ≥1 tool result + zero retries + zero failures + no taint flip
 *   med:  single source OR retries/circuit-breaker events OR partial tool results
 *   low:  taint flipped OR ceiling hit OR semantic conflict with sibling
 *
 * And the synthesizer-level confidence aggregation (R-03.22):
 *   computeFinalConfidence: MIN across contributing sub-agents + one-step demotion on
 *   detected contradiction.
 *
 * All inputs to `deriveConfidence` are rule signals from the sub-agent trace —
 * never LLM self-assessed values.
 */

import { describe, it, expect } from 'vitest'
import { deriveConfidence, computeFinalConfidence } from './confidence-derivation'
import type { ConfidenceSignals } from './phase-executor-contracts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signals(overrides: Partial<ConfidenceSignals> = {}): ConfidenceSignals {
  return {
    toolResultCount: 1,
    retryCount: 0,
    toolFailureCount: 0,
    taintFlippedDuringRun: false,
    ceilingHit: false,
    semanticConflictWithSibling: false,
    circuitBreakerEventOccurred: false,
    ...overrides,
  }
}

// ─── deriveConfidence ─────────────────────────────────────────────────────────

describe('deriveConfidence — per-sub-agent rule table', () => {
  describe('high confidence', () => {
    it('returns high when corroborated by ≥1 tool result, zero retries, zero failures, no taint', () => {
      expect(deriveConfidence(signals({ toolResultCount: 1 }))).toBe('high')
    })

    it('returns high when corroborated by multiple tool results', () => {
      expect(deriveConfidence(signals({ toolResultCount: 3 }))).toBe('high')
    })
  })

  describe('med confidence', () => {
    it('returns med when there are retries (even if corroborated)', () => {
      expect(deriveConfidence(signals({ toolResultCount: 2, retryCount: 1 }))).toBe('med')
    })

    it('returns med when there are tool failures', () => {
      expect(deriveConfidence(signals({ toolResultCount: 1, toolFailureCount: 1 }))).toBe('med')
    })

    it('returns med when circuit-breaker events occurred', () => {
      expect(
        deriveConfidence(signals({ toolResultCount: 1, circuitBreakerEventOccurred: true })),
      ).toBe('med')
    })

    it('returns med when toolResultCount is 0 (no corroboration — single partial result)', () => {
      expect(deriveConfidence(signals({ toolResultCount: 0 }))).toBe('med')
    })
  })

  describe('low confidence', () => {
    it('returns low when taint flipped during run (highest precedence)', () => {
      expect(deriveConfidence(signals({ taintFlippedDuringRun: true }))).toBe('low')
    })

    it('returns low when ceiling hit', () => {
      expect(deriveConfidence(signals({ ceilingHit: true }))).toBe('low')
    })

    it('returns low when semantic conflict with sibling', () => {
      expect(deriveConfidence(signals({ semanticConflictWithSibling: true }))).toBe('low')
    })

    it('returns low even when tool results and no retries if taint flipped', () => {
      expect(
        deriveConfidence(
          signals({ toolResultCount: 5, retryCount: 0, taintFlippedDuringRun: true }),
        ),
      ).toBe('low')
    })

    it('returns low even when no other signal if ceiling was hit', () => {
      expect(
        deriveConfidence(
          signals({ toolResultCount: 2, retryCount: 0, toolFailureCount: 0, ceilingHit: true }),
        ),
      ).toBe('low')
    })
  })

  describe('signal precedence', () => {
    it('low beats med: taint + retry → low', () => {
      expect(deriveConfidence(signals({ taintFlippedDuringRun: true, retryCount: 1 }))).toBe('low')
    })

    it('low beats high: ceiling hit + corroborated → low', () => {
      expect(deriveConfidence(signals({ toolResultCount: 3, ceilingHit: true }))).toBe('low')
    })

    it('med beats high: retry + corroborated → med', () => {
      expect(deriveConfidence(signals({ toolResultCount: 2, retryCount: 1 }))).toBe('med')
    })
  })
})

// ─── computeFinalConfidence ───────────────────────────────────────────────────

describe('computeFinalConfidence — synthesizer-level aggregation', () => {
  it('returns min confidence across all sub-agents', () => {
    expect(computeFinalConfidence(['high', 'med', 'high'], false)).toBe('med')
    expect(computeFinalConfidence(['high', 'high', 'high'], false)).toBe('high')
    expect(computeFinalConfidence(['low', 'high', 'med'], false)).toBe('low')
  })

  it('returns low when any sub-agent is low (regardless of others)', () => {
    expect(computeFinalConfidence(['low', 'low', 'low'], false)).toBe('low')
    expect(computeFinalConfidence(['high', 'high', 'low'], false)).toBe('low')
  })

  it('demotes one tier when contradiction detected: high → med', () => {
    expect(computeFinalConfidence(['high', 'high'], true)).toBe('med')
  })

  it('demotes one tier when contradiction detected: med → low', () => {
    expect(computeFinalConfidence(['high', 'med'], true)).toBe('low')
  })

  it('does not demote below low: low + contradiction stays low', () => {
    expect(computeFinalConfidence(['low', 'low'], true)).toBe('low')
    expect(computeFinalConfidence(['high', 'low'], true)).toBe('low')
  })

  it('handles single sub-agent without demotion', () => {
    expect(computeFinalConfidence(['high'], false)).toBe('high')
    expect(computeFinalConfidence(['med'], false)).toBe('med')
    expect(computeFinalConfidence(['low'], false)).toBe('low')
  })

  it('handles single sub-agent with demotion: high → med', () => {
    expect(computeFinalConfidence(['high'], true)).toBe('med')
  })

  it('empty outputs defaults to low confidence', () => {
    expect(computeFinalConfidence([], false)).toBe('low')
    expect(computeFinalConfidence([], true)).toBe('low')
  })
})
