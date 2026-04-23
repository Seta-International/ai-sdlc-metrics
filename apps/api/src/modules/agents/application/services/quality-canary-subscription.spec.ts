import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GracefulDegradationLadder } from './graceful-degradation-ladder'
import { QualityCanarySubscription } from './quality-canary-subscription'
import type { CanaryStateChange } from '../../domain/cost/cost-types'

function makeEvent(overrides?: Partial<CanaryStateChange>): CanaryStateChange {
  return {
    windowId: 'win-1',
    observedAt: new Date('2026-04-23T00:00:00Z'),
    primaryTierHealthy: true,
    fallbackTierHealthy: true,
    successRatePct: { primary: 99, fallback: 99 },
    severity: 'nominal',
    ...overrides,
  }
}

describe('QualityCanarySubscription', () => {
  let sub: QualityCanarySubscription

  beforeEach(() => {
    sub = new QualityCanarySubscription()
  })

  it('initial state is nominal', () => {
    expect(sub.getCurrentState()).toEqual({ severity: 'nominal' })
  })

  it('publish updates state and calls handlers', () => {
    const handler = vi.fn()
    sub.subscribe(handler)

    const event = makeEvent({ severity: 'primary_degraded', windowId: 'win-2' })
    sub.publish(event)

    expect(sub.getCurrentState()).toEqual({
      severity: 'primary_degraded',
      canaryWindowId: 'win-2',
    })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('subscribe returns unsubscribe function that stops handler calls', () => {
    const handler = vi.fn()
    const unsubscribe = sub.subscribe(handler)

    unsubscribe()

    sub.publish(makeEvent({ severity: 'both_degraded' }))

    expect(handler).not.toHaveBeenCalled()
  })

  it('getCurrentState reflects latest published state', () => {
    sub.publish(makeEvent({ severity: 'both_degraded', windowId: 'win-3' }))
    sub.publish(makeEvent({ severity: 'collapse', windowId: 'win-4' }))

    expect(sub.getCurrentState()).toEqual({
      severity: 'collapse',
      canaryWindowId: 'win-4',
    })
  })

  it('multiple handlers all receive events', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    sub.subscribe(h1)
    sub.subscribe(h2)

    sub.publish(makeEvent())

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })
})

describe('R-05.42 integration — canary event drives ladder steps 4/5/6', () => {
  it('primary_degraded event → ladder step 4', () => {
    const subscription = new QualityCanarySubscription()
    const ladder = new GracefulDegradationLadder()

    subscription.publish(makeEvent({ severity: 'primary_degraded', windowId: 'win-int-1' }))

    const result = ladder.evaluate({
      trigger: 'canary_degraded_primary',
      modelId: 'gpt-5.4',
      iteration: 1,
      currentTier: 'full',
      tenantState: subscription.getCurrentState(),
    })
    expect(result.step).toBe(4)
    expect(result.traceTag).toBe('tier_shift')
  })

  it('both_degraded event → ladder step 5', () => {
    const subscription = new QualityCanarySubscription()
    const ladder = new GracefulDegradationLadder()

    subscription.publish(makeEvent({ severity: 'both_degraded', windowId: 'win-int-2' }))

    const result = ladder.evaluate({
      trigger: 'canary_degraded_both',
      modelId: 'gpt-5.4',
      iteration: 1,
      currentTier: 'full',
      tenantState: subscription.getCurrentState(),
    })
    expect(result.step).toBe(5)
    expect(result.traceTag).toBe('tier_shift')
  })

  it('collapse event → ladder step 6', () => {
    const subscription = new QualityCanarySubscription()
    const ladder = new GracefulDegradationLadder()

    subscription.publish(makeEvent({ severity: 'collapse', windowId: 'win-int-3' }))

    const result = ladder.evaluate({
      trigger: 'canary_collapse',
      modelId: 'gpt-5.4',
      iteration: 1,
      currentTier: 'full',
      tenantState: subscription.getCurrentState(),
    })
    expect(result.step).toBe(6)
    expect(result.traceTag).toBe('refused')
    expect(result.cancellationReason).toBe('quality_canary')
  })
})
