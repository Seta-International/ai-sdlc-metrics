/**
 * Tests for SamplingDecider — all 5 config types, deterministic ratio,
 * composite any/all logic, trigger priority over baseline.
 */

import { describe, it, expect } from 'vitest'
import { SamplingDecider } from './sampling-decider'
import type {
  SamplingConfig,
  TriggerPredicateContext,
} from '../../domain/observability/sampling-config'
import {
  STRATIFIED_MVP_CONFIG,
  ALWAYS_CAPTURE_CONFIG,
  turnNotCompletedTrigger,
  ceilingHitTrigger,
} from '../../domain/observability/sampling-config'

const decider = new SamplingDecider()

const baseCtx: TriggerPredicateContext = {
  turnEndedReason: 'completed',
  taintFlipped: false,
  approvalRequiredDraftSubmitted: false,
  compositionAmplification: false,
  iterationCeilingHit: false,
  wallclockCeilingHit: false,
  costCeilingHit: false,
}

// ─── type: 'always' ───────────────────────────────────────────────────────────

describe("SamplingDecider — type 'always'", () => {
  it('always captures', () => {
    const config: SamplingConfig = { type: 'always' }
    const d = decider.decide({ config, ctx: baseCtx })
    expect(d.capture).toBe(true)
    expect(d.reason).toBe('always')
    expect(d.triggersMatched).toEqual([])
  })
})

// ─── type: 'never' ───────────────────────────────────────────────────────────

describe("SamplingDecider — type 'never'", () => {
  it('never captures', () => {
    const config: SamplingConfig = { type: 'never' }
    const d = decider.decide({ config, ctx: baseCtx })
    expect(d.capture).toBe(false)
    expect(d.reason).toBe('never')
    expect(d.triggersMatched).toEqual([])
  })
})

// ─── type: 'ratio' ───────────────────────────────────────────────────────────

describe("SamplingDecider — type 'ratio'", () => {
  it('samples in when random() < probability', () => {
    const config: SamplingConfig = { type: 'ratio', probability: 0.5 }
    const d = decider.decide({ config, ctx: baseCtx, random: () => 0.3 })
    expect(d.capture).toBe(true)
    expect(d.reason).toBe('ratio_sampled_in')
    expect(d.triggersMatched).toEqual([])
  })

  it('samples out when random() >= probability', () => {
    const config: SamplingConfig = { type: 'ratio', probability: 0.5 }
    const d = decider.decide({ config, ctx: baseCtx, random: () => 0.7 })
    expect(d.capture).toBe(false)
    expect(d.reason).toBe('ratio_sampled_out')
    expect(d.triggersMatched).toEqual([])
  })

  it('samples out when random() === probability (exclusive boundary)', () => {
    const config: SamplingConfig = { type: 'ratio', probability: 0.5 }
    const d = decider.decide({ config, ctx: baseCtx, random: () => 0.5 })
    expect(d.capture).toBe(false)
    expect(d.reason).toBe('ratio_sampled_out')
  })
})

// ─── type: 'triggered' ───────────────────────────────────────────────────────

describe("SamplingDecider — type 'triggered'", () => {
  const config: SamplingConfig = {
    type: 'triggered',
    baselineProbability: 0.1,
    triggers: [turnNotCompletedTrigger, ceilingHitTrigger],
  }

  it('captures when a trigger matches (ignores random)', () => {
    const ctx = { ...baseCtx, turnEndedReason: 'error' }
    const d = decider.decide({ config, ctx, random: () => 0.99 }) // random would sample out
    expect(d.capture).toBe(true)
    expect(d.reason).toBe('trigger_matched')
    expect(d.triggersMatched).toContain('turnNotCompletedTrigger')
  })

  it('reports all matching triggers', () => {
    const ctx = { ...baseCtx, turnEndedReason: 'error', iterationCeilingHit: true }
    const d = decider.decide({ config, ctx, random: () => 0.99 })
    expect(d.triggersMatched).toContain('turnNotCompletedTrigger')
    expect(d.triggersMatched).toContain('ceilingHitTrigger')
  })

  it('falls back to baseline when no trigger matches — sampled in', () => {
    const d = decider.decide({ config, ctx: baseCtx, random: () => 0.05 })
    expect(d.capture).toBe(true)
    expect(d.reason).toBe('baseline_sampled_in')
    expect(d.triggersMatched).toEqual([])
  })

  it('falls back to baseline when no trigger matches — sampled out', () => {
    const d = decider.decide({ config, ctx: baseCtx, random: () => 0.5 })
    expect(d.capture).toBe(false)
    expect(d.reason).toBe('baseline_sampled_out')
    expect(d.triggersMatched).toEqual([])
  })
})

// ─── type: 'composite' ───────────────────────────────────────────────────────

describe("SamplingDecider — type 'composite'", () => {
  it("strategy 'any' captures if any child captures", () => {
    const config: SamplingConfig = {
      type: 'composite',
      strategy: 'any',
      configs: [{ type: 'never' }, { type: 'always' }],
    }
    const d = decider.decide({ config, ctx: baseCtx })
    expect(d.capture).toBe(true)
    expect(d.reason).toBe('composite')
  })

  it("strategy 'any' does not capture when all children are never", () => {
    const config: SamplingConfig = {
      type: 'composite',
      strategy: 'any',
      configs: [{ type: 'never' }, { type: 'never' }],
    }
    const d = decider.decide({ config, ctx: baseCtx })
    expect(d.capture).toBe(false)
    expect(d.reason).toBe('composite')
  })

  it("strategy 'all' captures only when all children capture", () => {
    const config: SamplingConfig = {
      type: 'composite',
      strategy: 'all',
      configs: [{ type: 'always' }, { type: 'always' }],
    }
    const d = decider.decide({ config, ctx: baseCtx })
    expect(d.capture).toBe(true)
    expect(d.reason).toBe('composite')
  })

  it("strategy 'all' does not capture if any child is never", () => {
    const config: SamplingConfig = {
      type: 'composite',
      strategy: 'all',
      configs: [{ type: 'always' }, { type: 'never' }],
    }
    const d = decider.decide({ config, ctx: baseCtx })
    expect(d.capture).toBe(false)
    expect(d.reason).toBe('composite')
  })

  it('unions triggersMatched from all children', () => {
    const triggered: SamplingConfig = {
      type: 'triggered',
      baselineProbability: 0,
      triggers: [turnNotCompletedTrigger],
    }
    const config: SamplingConfig = {
      type: 'composite',
      strategy: 'any',
      configs: [triggered, { type: 'always' }],
    }
    const ctx = { ...baseCtx, turnEndedReason: 'error' }
    const d = decider.decide({ config, ctx })
    expect(d.triggersMatched).toContain('turnNotCompletedTrigger')
  })
})

// ─── STRATIFIED_MVP_CONFIG integration ───────────────────────────────────────

describe('STRATIFIED_MVP_CONFIG integration', () => {
  it('captures on any of the 5 triggers even with low random', () => {
    const ctx = { ...baseCtx, taintFlipped: true }
    const d = decider.decide({ config: STRATIFIED_MVP_CONFIG, ctx, random: () => 0.99 })
    expect(d.capture).toBe(true)
    expect(d.reason).toBe('trigger_matched')
  })

  it('does not capture completed turns at baseline (> 0.01)', () => {
    const d = decider.decide({ config: STRATIFIED_MVP_CONFIG, ctx: baseCtx, random: () => 0.5 })
    expect(d.capture).toBe(false)
    expect(d.reason).toBe('baseline_sampled_out')
  })

  it('captures completed turns at baseline (< 0.01)', () => {
    const d = decider.decide({ config: STRATIFIED_MVP_CONFIG, ctx: baseCtx, random: () => 0.005 })
    expect(d.capture).toBe(true)
    expect(d.reason).toBe('baseline_sampled_in')
  })
})

// ─── ALWAYS_CAPTURE_CONFIG integration ───────────────────────────────────────

describe('ALWAYS_CAPTURE_CONFIG integration', () => {
  it('always returns capture=true', () => {
    const d = decider.decide({ config: ALWAYS_CAPTURE_CONFIG, ctx: baseCtx })
    expect(d.capture).toBe(true)
  })
})
