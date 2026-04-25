/**
 * Tests for SamplingConfig types and the 5 MVP trigger predicates.
 */

import { describe, it, expect } from 'vitest'
import {
  turnNotCompletedTrigger,
  ceilingHitTrigger,
  taintFlippedTrigger,
  approvalRequiredTrigger,
  compositionAmplificationTrigger,
  iterativeTopologyTrigger,
  STRATIFIED_MVP_CONFIG,
  ALWAYS_CAPTURE_CONFIG,
} from './sampling-config'
import type { TriggerPredicateContext } from './sampling-config'

const baseCtx: TriggerPredicateContext = {
  turnEndedReason: 'completed',
  taintFlipped: false,
  approvalRequiredDraftSubmitted: false,
  compositionAmplification: false,
  iterationCeilingHit: false,
  wallclockCeilingHit: false,
  costCeilingHit: false,
}

// ─── turnNotCompletedTrigger ─────────────────────────────────────────────────

describe('turnNotCompletedTrigger', () => {
  it('fires when turnEndedReason is not completed', () => {
    expect(turnNotCompletedTrigger({ ...baseCtx, turnEndedReason: 'refused' })).toBe(true)
    expect(turnNotCompletedTrigger({ ...baseCtx, turnEndedReason: 'error' })).toBe(true)
    expect(turnNotCompletedTrigger({ ...baseCtx, turnEndedReason: 'budget' })).toBe(true)
    expect(turnNotCompletedTrigger({ ...baseCtx, turnEndedReason: 'timeout' })).toBe(true)
    expect(turnNotCompletedTrigger({ ...baseCtx, turnEndedReason: 'user_cancel' })).toBe(true)
    expect(turnNotCompletedTrigger({ ...baseCtx, turnEndedReason: 'quality_canary' })).toBe(true)
  })

  it('does not fire when turnEndedReason is completed', () => {
    expect(turnNotCompletedTrigger({ ...baseCtx, turnEndedReason: 'completed' })).toBe(false)
  })

  it('does not fire when turnEndedReason is undefined', () => {
    expect(turnNotCompletedTrigger({ ...baseCtx, turnEndedReason: undefined })).toBe(false)
  })
})

// ─── ceilingHitTrigger ───────────────────────────────────────────────────────

describe('ceilingHitTrigger', () => {
  it('fires when iterationCeilingHit is true', () => {
    expect(ceilingHitTrigger({ ...baseCtx, iterationCeilingHit: true })).toBe(true)
  })

  it('fires when wallclockCeilingHit is true', () => {
    expect(ceilingHitTrigger({ ...baseCtx, wallclockCeilingHit: true })).toBe(true)
  })

  it('fires when costCeilingHit is true', () => {
    expect(ceilingHitTrigger({ ...baseCtx, costCeilingHit: true })).toBe(true)
  })

  it('fires when multiple ceilings hit', () => {
    expect(ceilingHitTrigger({ ...baseCtx, iterationCeilingHit: true, costCeilingHit: true })).toBe(
      true,
    )
  })

  it('does not fire when no ceiling hit', () => {
    expect(ceilingHitTrigger(baseCtx)).toBe(false)
  })
})

// ─── taintFlippedTrigger ─────────────────────────────────────────────────────

describe('taintFlippedTrigger', () => {
  it('fires when taintFlipped is true', () => {
    expect(taintFlippedTrigger({ ...baseCtx, taintFlipped: true })).toBe(true)
  })

  it('does not fire when taintFlipped is false', () => {
    expect(taintFlippedTrigger(baseCtx)).toBe(false)
  })
})

// ─── approvalRequiredTrigger ─────────────────────────────────────────────────

describe('approvalRequiredTrigger', () => {
  it('fires when approvalRequiredDraftSubmitted is true', () => {
    expect(approvalRequiredTrigger({ ...baseCtx, approvalRequiredDraftSubmitted: true })).toBe(true)
  })

  it('does not fire when approvalRequiredDraftSubmitted is false', () => {
    expect(approvalRequiredTrigger(baseCtx)).toBe(false)
  })
})

// ─── compositionAmplificationTrigger ─────────────────────────────────────────

describe('compositionAmplificationTrigger', () => {
  it('fires when compositionAmplification is true', () => {
    expect(compositionAmplificationTrigger({ ...baseCtx, compositionAmplification: true })).toBe(
      true,
    )
  })

  it('does not fire when compositionAmplification is false', () => {
    expect(compositionAmplificationTrigger(baseCtx)).toBe(false)
  })
})

// ─── iterativeTopologyTrigger ─────────────────────────────────────────────────

describe('iterativeTopologyTrigger (R-12.18)', () => {
  it('fires when iterativeTopology is true', () => {
    expect(iterativeTopologyTrigger({ ...baseCtx, iterativeTopology: true })).toBe(true)
  })

  it('does not fire when iterativeTopology is false', () => {
    expect(iterativeTopologyTrigger({ ...baseCtx, iterativeTopology: false })).toBe(false)
  })

  it('does not fire when iterativeTopology is undefined (non-iterative turn)', () => {
    expect(iterativeTopologyTrigger(baseCtx)).toBe(false)
  })
})

// ─── Named exports are named functions ───────────────────────────────────────

describe('trigger predicate function names', () => {
  it('predicates have function names (used in triggersMatched diagnostics)', () => {
    expect(turnNotCompletedTrigger.name).toBe('turnNotCompletedTrigger')
    expect(ceilingHitTrigger.name).toBe('ceilingHitTrigger')
    expect(taintFlippedTrigger.name).toBe('taintFlippedTrigger')
    expect(approvalRequiredTrigger.name).toBe('approvalRequiredTrigger')
    expect(compositionAmplificationTrigger.name).toBe('compositionAmplificationTrigger')
    expect(iterativeTopologyTrigger.name).toBe('iterativeTopologyTrigger')
  })
})

// ─── Default configs ─────────────────────────────────────────────────────────

describe('STRATIFIED_MVP_CONFIG', () => {
  it('is type triggered with 0.01 baseline', () => {
    expect(STRATIFIED_MVP_CONFIG.type).toBe('triggered')
    if (STRATIFIED_MVP_CONFIG.type === 'triggered') {
      expect(STRATIFIED_MVP_CONFIG.baselineProbability).toBe(0.01)
      expect(STRATIFIED_MVP_CONFIG.triggers).toHaveLength(6)
    }
  })

  it('R-12.18: iterativeTopologyTrigger is included in STRATIFIED_MVP_CONFIG', () => {
    if (STRATIFIED_MVP_CONFIG.type === 'triggered') {
      const names = STRATIFIED_MVP_CONFIG.triggers.map((t) => t.name)
      expect(names).toContain('iterativeTopologyTrigger')
    }
  })

  it('R-12.18: iterative topology forces 100% capture via STRATIFIED_MVP_CONFIG', () => {
    if (STRATIFIED_MVP_CONFIG.type !== 'triggered') return

    const ctx: TriggerPredicateContext = { ...baseCtx, iterativeTopology: true }
    const matched = STRATIFIED_MVP_CONFIG.triggers
      .filter((trigger) => trigger(ctx))
      .map((trigger) => trigger.name)
    expect(matched).toContain('iterativeTopologyTrigger')
  })
})

describe('ALWAYS_CAPTURE_CONFIG', () => {
  it('is type always', () => {
    expect(ALWAYS_CAPTURE_CONFIG.type).toBe('always')
  })
})
